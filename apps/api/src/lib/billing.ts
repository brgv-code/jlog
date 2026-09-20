/**
 * What a Stripe event means for a user's access (ADR-011).
 *
 * Deliberately pure and deliberately not typed against `Stripe.Event`: the
 * decision is the part worth testing, and it should be testable without
 * constructing a full Stripe object or holding an API key. The route does the
 * signature check, the lookup and the write; this decides only what the row
 * should say afterwards.
 */

export type PlanChange = {
  plan: 'free' | 'pro';
  planStatus: string;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: Date | null;
};

/**
 * The change, plus both ways of finding who it belongs to.
 *
 * `customerId` is the normal path. `userId` is set only on checkout, from the
 * `client_reference_id` we put on the session, and exists because that is the
 * one event that can arrive before the customer id has been written to our
 * side — leaving the customer link as the only route would drop the very first
 * upgrade of an account.
 */
export type BillingDecision = {
  customerId: string | null;
  userId: string | null;
  change: PlanChange;
};

/**
 * Statuses that keep the feature unlocked.
 *
 * `past_due` is in here on purpose. A card that failed this morning is not the
 * same decision as a cancellation, and Stripe's own dunning will move the
 * subscription to `canceled` or `unpaid` if it stays unpaid — at which point
 * this returns `free` on its own. Revoking on the first failed charge would
 * punish an expired card with instant loss of access to your own CV.
 */
const ENTITLING: ReadonlySet<string> = new Set(['active', 'trialing', 'past_due']);

type Unknown = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/**
 * `current_period_end` sits on the subscription in older API versions and on
 * each subscription item in newer ones. Reading both means an API version bump
 * does not silently start storing null.
 */
function periodEnd(sub: Unknown): Date | null {
  const top = sub.current_period_end;
  if (typeof top === 'number') return new Date(top * 1000);
  const items = (sub.items as Unknown | undefined)?.data;
  const first = Array.isArray(items) ? (items[0] as Unknown | undefined) : undefined;
  const nested = first?.current_period_end;
  return typeof nested === 'number' ? new Date(nested * 1000) : null;
}

function fromSubscription(sub: Unknown): BillingDecision | null {
  const customerId = str(sub.customer) ?? str((sub.customer as Unknown | undefined)?.id);
  if (!customerId) return null;
  const status = str(sub.status) ?? 'unknown';
  return {
    customerId,
    userId: null,
    change: {
      plan: ENTITLING.has(status) ? 'pro' : 'free',
      planStatus: status,
      stripeSubscriptionId: str(sub.id),
      currentPeriodEnd: periodEnd(sub),
    },
  };
}

/**
 * Returns null for events we do not act on, which is most of them — Stripe
 * sends a great deal and a handler that tried to interpret all of it would be
 * wrong more often than useful.
 */
export function planChangeFor(event: {
  type: string;
  data: { object: unknown };
}): BillingDecision | null {
  const object = event.data.object as Unknown | null;
  if (!object || typeof object !== 'object') return null;

  switch (event.type) {
    /**
     * The upgrade moment. The session carries the customer and subscription but
     * not a reliable status, so this grants access and lets the
     * `customer.subscription.*` events that follow fill in the detail.
     */
    case 'checkout.session.completed': {
      if (str(object.mode) !== 'subscription') return null;
      const customerId = str(object.customer) ?? str((object.customer as Unknown | undefined)?.id);
      const userId = str(object.client_reference_id);
      if (!customerId && !userId) return null;
      return {
        customerId,
        userId,
        change: {
          plan: 'pro',
          planStatus: 'active',
          stripeSubscriptionId: str(object.subscription),
          currentPeriodEnd: null,
        },
      };
    }

    // Renewals, upgrades, cancellations scheduled at period end, and recovery
    // from a failed payment all arrive as an updated subscription.
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      return fromSubscription(object);

    // The subscription is gone. Status is whatever Stripe last said, but the
    // answer is `free` regardless of it.
    case 'customer.subscription.deleted': {
      const decided = fromSubscription(object);
      if (!decided) return null;
      return {
        ...decided,
        change: { ...decided.change, plan: 'free', planStatus: 'canceled' },
      };
    }

    default:
      return null;
  }
}
