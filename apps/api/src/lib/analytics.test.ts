import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureEvent, eventFor } from './analytics';

describe('eventFor', () => {
  it.each([
    ['POST', '/api/applications', 'application created'],
    ['PATCH', '/api/applications/abc123', 'application updated'],
    ['DELETE', '/api/applications/abc123', 'application deleted'],
    ['POST', '/api/applications/abc123/events', 'follow up logged'],
    ['POST', '/api/extract', 'job extracted with ai'],
    ['POST', '/api/extension/token', 'extension key created'],
    ['POST', '/api/profile/import/commit', 'cv imported'],
    ['PUT', '/api/profile/autofill', 'autofill answers saved'],
    ['GET', '/api/profile/autofill', 'autofill profile loaded'],
    ['PUT', '/api/llm/config', 'ai provider configured'],
    ['POST', '/api/billing/checkout', 'checkout started'],
  ])('%s %s is "%s"', (method, path, event) => {
    expect(eventFor(method, path)?.event).toBe(event);
  });

  it('names the pro feature by its first path segment, never an id', () => {
    expect(eventFor('POST', '/api/pro/tailor/abc123')).toEqual({
      event: 'pro feature used',
      properties: { feature: 'tailor' },
    });
  });

  it('ignores reads and anything not in the table', () => {
    expect(eventFor('GET', '/api/applications')).toBeNull();
    expect(eventFor('POST', '/api/auth/sign-out')).toBeNull();
  });
});

describe('captureEvent', () => {
  afterEach(() => vi.unstubAllGlobals());

  const env = { POSTHOG_KEY: 'phc_test', POSTHOG_HOST: 'https://eu.i.posthog.com' };

  it('sends nothing without a PostHog key', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const hasConsent = vi.fn();

    await captureEvent({}, { userId: 'u1', event: 'x', hasConsent });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(hasConsent).not.toHaveBeenCalled();
  });

  it('sends nothing for an account that has not accepted', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await captureEvent(env, { userId: 'u1', event: 'x', hasConsent: async () => false });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends the event to the EU host under the account id once accepted', async () => {
    const fetchSpy = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchSpy);

    await captureEvent(env, {
      userId: 'u1',
      event: 'application created',
      properties: { via: 'extension' },
      sessionId: 'sess-1',
      hasConsent: async () => true,
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://eu.i.posthog.com/i/v0/e/');
    expect(JSON.parse(String(init.body))).toMatchObject({
      api_key: 'phc_test',
      event: 'application created',
      distinct_id: 'u1',
      properties: { via: 'extension', $session_id: 'sess-1', $lib: 'jlog-api' },
    });
  });

  it('never throws when PostHog is down, since analytics must not break a request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('down'))),
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(
      captureEvent(env, { userId: 'u1', event: 'x', hasConsent: async () => true }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
