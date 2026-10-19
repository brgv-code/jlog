import { describe, expect, it } from 'vitest';
import router from './billing';

const STRIPE = { STRIPE_SECRET_KEY: 'sk_test', STRIPE_PRICE_ID: 'price_1' };

async function enabled(env: Record<string, string>): Promise<boolean> {
  const res = await router.request('/config', {}, env);
  return ((await res.json()) as { enabled: boolean }).enabled;
}

// Settings shows an upgrade only when this says so. Free for everyone is the
// default, so Stripe being configured is not enough on its own.
describe('/config', () => {
  it('is off with Stripe configured but paid plans unset', async () => {
    expect(await enabled(STRIPE)).toBe(false);
  });

  it('is on with paid plans and Stripe both set', async () => {
    expect(await enabled({ ...STRIPE, PAID_PLANS: 'true' })).toBe(true);
  });

  it('is off with paid plans set but no Stripe', async () => {
    expect(await enabled({ PAID_PLANS: 'true' })).toBe(false);
  });
});
