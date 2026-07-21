import { describe, expect, it } from 'vitest';
import { PRO_REQUIRED_ERROR, createProRouter, isProEnabled, requirePro } from './index';

describe('@jlog/pro stub', () => {
  it('reports the feature as disabled', () => {
    expect(isProEnabled).toBe(false);
  });

  it('returns 402 with the standard error body for any pro route', async () => {
    const router = createProRouter();
    const res = await router.request('/generate', { method: 'POST' });
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual(PRO_REQUIRED_ERROR);
  });

  it('requirePro middleware blocks with 402', async () => {
    const app = new (await import('hono')).Hono();
    app.use('/guarded', requirePro);
    app.get('/guarded', (c) => c.text('should not reach'));
    const res = await app.request('/guarded');
    expect(res.status).toBe(402);
  });
});
