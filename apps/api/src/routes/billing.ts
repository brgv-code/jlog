import { createDb, stripeEvents, users } from '@jlog/db';
import { and, eq, isNull, or } from 'drizzle-orm';
import { Hono } from 'hono';
import Stripe from 'stripe';
import type { Env, Variables } from '../index';
import { planChangeFor } from '../lib/billing';
import { requireSession } from '../lib/session';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * Stripe billing for the hosted instance (ADR-011).
 *
 * Stripe is the system of record for billing; D1 is the system of record for
 * access. Webhooks mirror subscription state onto `users`, and `requirePro`
 * keeps reading `plan` as a single local SELECT — unchanged, so none of this
 * can regress the gate it pays for.
 *
 * Public rather than in `@jlog/pro` on purpose: the protected IP is the
 * tailoring agent and the renderer, none of which this touches. Absent the
 * secrets it fails closed and says which one is missing, so a self-hoster has
 * no billing rather than a broken one — the same shape as
 * `COMPILE_NOT_CONFIGURED`.
 */

/** `Stripe.createFetchHttpClient()` is required: Workers has no Node `http`. */
function makeStripe(env: Env): Stripe | null {
  if (!env.STRIPE_SECRET_KEY) return null;
  return new Stripe(env.STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });
}

function notConfigured(missing: string) {
  return {
    error: {
      code: 'BILLING_NOT_CONFIGURED',
      message: `Billing is not configured (missing ${missing}).`,
    },
  } as const;
}

/**
 * Start a checkout. Returns the URL rather than redirecting, so the caller is
 * a `fetch` from the settings page instead of a form post.
 */
router.post('/checkout', async (c) => {
  const session = requireSession(c);
  const stripe = makeStripe(c.env);
  if (!stripe) return c.json(notConfigured('STRIPE_SECRET_KEY'), 503);
  if (!c.env.STRIPE_PRICE_ID) return c.json(notConfigured('STRIPE_PRICE_ID'), 503);

  const db = createDb(c.env.DB);
  const [user] = await db.select().from(users).where(eq(users.id, session.userId));
  if (!user) return c.json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }, 401);

  // Reuse the customer if this account has ever checked out, so a second
  // subscription does not create a second customer holding the same card.
  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name,
      metadata: { jlogUserId: user.id },
    });
    customerId = customer.id;
    await db.update(users).set({ stripeCustomerId: customerId }).where(eq(users.id, user.id));
  }

  const checkout = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    // The fallback the webhook uses when the customer link is not readable yet.
    client_reference_id: user.id,
    line_items: [{ price: c.env.STRIPE_PRICE_ID, quantity: 1 }],
    success_url: `${c.env.WEB_ORIGIN}/settings?upgraded=1`,
    cancel_url: `${c.env.WEB_ORIGIN}/settings`,
  });

  return c.json({ url: checkout.url });
});

/** Cancellation and card updates are Stripe's problem, not ours. */
router.post('/portal', async (c) => {
  const session = requireSession(c);
  const stripe = makeStripe(c.env);
  if (!stripe) return c.json(notConfigured('STRIPE_SECRET_KEY'), 503);

  const db = createDb(c.env.DB);
  const [user] = await db.select().from(users).where(eq(users.id, session.userId));
  if (!user?.stripeCustomerId) {
    return c.json(
      { error: { code: 'NO_BILLING_ACCOUNT', message: 'This account has never been billed.' } },
      404,
    );
  }

  const portal = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${c.env.WEB_ORIGIN}/settings`,
  });
  return c.json({ url: portal.url });
});

/**
 * Stripe's webhook. Unauthenticated by design — it is server to server, so
 * there is no cookie — and trusted only through the signature.
 */
router.post('/webhook', async (c) => {
  const stripe = makeStripe(c.env);
  if (!stripe || !c.env.STRIPE_WEBHOOK_SECRET) {
    return c.json(notConfigured('STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET'), 503);
  }

  const signature = c.req.header('stripe-signature');
  if (!signature) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'Missing stripe-signature.' } }, 400);
  }

  // The unparsed bytes, read exactly once. Anything that touches `c.req.json()`
  // first makes this throw "Body has already been used", and the signature is
  // over the raw text rather than over a re-serialized object.
  const raw = await c.req.text();

  let event: Stripe.Event;
  try {
    // Async, with the WebCrypto provider: the synchronous `constructEvent`
    // cannot work on Workers because SubtleCrypto is promise-based.
    event = await stripe.webhooks.constructEventAsync(
      raw,
      signature,
      c.env.STRIPE_WEBHOOK_SECRET,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch (err) {
    // 400 rather than 500: a signature that does not verify is a rejected
    // request, and Stripe should not retry it.
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: { code: 'BAD_SIGNATURE', message } }, 400);
  }

  const db = createDb(c.env.DB);

  // Idempotency before work, not after. Stripe retries until it gets a 2xx, so
  // duplicates are routine; the insert is the lock and `returning()` is how we
  // learn whether this delivery was the first one.
  const claimed = await db
    .insert(stripeEvents)
    .values({ id: event.id, type: event.type, receivedAt: new Date() })
    .onConflictDoNothing()
    .returning({ id: stripeEvents.id });
  if (claimed.length === 0) return c.json({ received: true, duplicate: true });

  const decision = planChangeFor(event);
  if (!decision) return c.json({ received: true, ignored: event.type });

  const { customerId, userId, change } = decision;
  const who = userId
    ? eq(users.id, userId)
    : customerId
      ? eq(users.stripeCustomerId, customerId)
      : null;
  if (!who) return c.json({ received: true, ignored: 'no customer or user reference' });

  const updated = await db
    .update(users)
    .set({
      plan: change.plan,
      planSource: 'stripe',
      planStatus: change.planStatus,
      ...(change.stripeSubscriptionId ? { stripeSubscriptionId: change.stripeSubscriptionId } : {}),
      ...(change.currentPeriodEnd ? { currentPeriodEnd: change.currentPeriodEnd } : {}),
      ...(customerId ? { stripeCustomerId: customerId } : {}),
    })
    .where(
      and(
        who,
        // A comped account is never downgraded, or upgraded, by Stripe. This
        // clause is the whole reason `plan_source` exists: without it the first
        // `customer.subscription.deleted` revokes the owner's own access and
        // reads as a bug rather than as policy.
        or(isNull(users.planSource), eq(users.planSource, 'stripe')),
      ),
    )
    .returning({ id: users.id });

  // Not an error: a manual comp, or an event for a customer that is not ours.
  return c.json({ received: true, applied: updated.length > 0 });
});

export default router;
