import { describe, expect, it } from 'vitest';
import { planChangeFor } from './billing';

const event = (type: string, object: unknown) => ({ type, data: { object } });

const subscription = (over: Record<string, unknown> = {}) => ({
  id: 'sub_1',
  customer: 'cus_1',
  status: 'active',
  current_period_end: 1_760_000_000,
  ...over,
});

describe('planChangeFor', () => {
  it('grants pro on a completed subscription checkout', () => {
    const decided = planChangeFor(
      event('checkout.session.completed', {
        mode: 'subscription',
        customer: 'cus_1',
        client_reference_id: 'user_1',
        subscription: 'sub_1',
      }),
    );

    expect(decided).toEqual({
      customerId: 'cus_1',
      userId: 'user_1',
      change: {
        plan: 'pro',
        planStatus: 'active',
        stripeSubscriptionId: 'sub_1',
        currentPeriodEnd: null,
      },
    });
  });

  // A one-off payment is not a subscription and must not unlock a plan.
  it('ignores a checkout that is not in subscription mode', () => {
    expect(
      planChangeFor(event('checkout.session.completed', { mode: 'payment', customer: 'cus_1' })),
    ).toBeNull();
  });

  it('carries the user reference so the first upgrade is not lost', () => {
    const decided = planChangeFor(
      event('checkout.session.completed', {
        mode: 'subscription',
        client_reference_id: 'user_1',
      }),
    );
    expect(decided?.userId).toBe('user_1');
    expect(decided?.customerId).toBeNull();
  });

  it.each([
    ['active', 'pro'],
    ['trialing', 'pro'],
    // A card that failed this morning is not a cancellation; Stripe's dunning
    // moves it to canceled or unpaid if it stays unpaid, and that downgrades.
    ['past_due', 'pro'],
    ['canceled', 'free'],
    ['unpaid', 'free'],
    ['incomplete_expired', 'free'],
  ])('maps subscription status %s to %s', (status, plan) => {
    const decided = planChangeFor(event('customer.subscription.updated', subscription({ status })));
    expect(decided?.change.plan).toBe(plan);
    expect(decided?.change.planStatus).toBe(status);
  });

  it('downgrades on deletion whatever status the object carries', () => {
    const decided = planChangeFor(
      event('customer.subscription.deleted', subscription({ status: 'active' })),
    );
    expect(decided?.change).toMatchObject({ plan: 'free', planStatus: 'canceled' });
  });

  it('reads the period end from the subscription', () => {
    const decided = planChangeFor(event('customer.subscription.updated', subscription()));
    expect(decided?.change.currentPeriodEnd).toEqual(new Date(1_760_000_000 * 1000));
  });

  // Newer Stripe API versions moved the period onto each subscription item.
  // Reading only the old location would silently start storing null.
  it('falls back to the period end on the subscription item', () => {
    const decided = planChangeFor(
      event(
        'customer.subscription.updated',
        subscription({
          current_period_end: undefined,
          items: { data: [{ current_period_end: 1_770_000_000 }] },
        }),
      ),
    );
    expect(decided?.change.currentPeriodEnd).toEqual(new Date(1_770_000_000 * 1000));
  });

  it('survives a subscription with no period anywhere', () => {
    const decided = planChangeFor(
      event('customer.subscription.updated', subscription({ current_period_end: undefined })),
    );
    expect(decided?.change.currentPeriodEnd).toBeNull();
  });

  it('accepts an expanded customer object as well as an id', () => {
    const decided = planChangeFor(
      event('customer.subscription.updated', subscription({ customer: { id: 'cus_9' } })),
    );
    expect(decided?.customerId).toBe('cus_9');
  });

  it('ignores events it has no opinion about', () => {
    expect(planChangeFor(event('invoice.created', { id: 'in_1' }))).toBeNull();
    expect(planChangeFor(event('customer.subscription.updated', null))).toBeNull();
  });
});
