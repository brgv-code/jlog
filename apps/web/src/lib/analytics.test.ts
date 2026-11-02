import { beforeEach, describe, expect, it, vi } from 'vitest';

const posthog = vi.hoisted(() => ({
  init: vi.fn(),
  opt_in_capturing: vi.fn(),
  opt_out_capturing: vi.fn(),
  identify: vi.fn(),
  reset: vi.fn(),
  capture: vi.fn(),
}));
vi.mock('posthog-js', () => ({ default: posthog }));

const fetchSpy = vi.fn(async () => new Response('{}'));

/** A fresh module per test: it reads the key and tracks whether PostHog started at load. */
async function load(storage: Record<string, string> = {}) {
  vi.resetModules();
  vi.stubEnv('PUBLIC_POSTHOG_KEY', 'phc_test');
  vi.stubEnv('PUBLIC_API_URL', 'https://api.jlog.ai');
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage[key] ?? null,
    setItem: (key: string, value: string) => {
      storage[key] = value;
    },
  });
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('fetch', fetchSpy);
  return { analytics: await import('./analytics'), storage };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('consent', () => {
  it('loads nothing for a browser that has not answered', async () => {
    const { analytics } = await load();
    analytics.startAnalytics();
    analytics.capture('anything');
    expect(posthog.init).not.toHaveBeenCalled();
    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it('loads nothing after a no', async () => {
    const { analytics } = await load();
    analytics.setConsent('denied');
    expect(posthog.init).not.toHaveBeenCalled();
  });

  it('starts on a yes, on the EU host, with text and inputs hidden from replays', async () => {
    const { analytics, storage } = await load();
    analytics.setConsent('granted');

    expect(storage.jlog_analytics_consent).toBe('granted');
    expect(posthog.init).toHaveBeenCalledOnce();
    const [key, config] = posthog.init.mock.calls[0] as [string, Record<string, unknown>];
    expect(key).toBe('phc_test');
    expect(config).toMatchObject({
      api_host: 'https://eu.i.posthog.com',
      mask_all_text: true,
      session_recording: { maskAllInputs: true, maskTextSelector: '*' },
      tracing_headers: ['api.jlog.ai'],
    });
  });

  it('saves the answer to the account so server events follow it', async () => {
    const { analytics } = await load();
    analytics.setConsent('denied');
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.jlog.ai/api/settings/analytics-consent');
    expect(JSON.parse(String(init.body))).toEqual({ granted: false });
  });
});

describe('linkAccount', () => {
  it("adopts the account's yes in a new browser, then identifies by account id", async () => {
    const { analytics, storage } = await load();
    analytics.linkAccount({ id: 'u1', email: 'a@b.c', analyticsConsent: true });

    expect(storage.jlog_analytics_consent).toBe('granted');
    expect(posthog.init).toHaveBeenCalledOnce();
    expect(posthog.identify).toHaveBeenCalledWith('u1', { email: 'a@b.c', demo: false });
  });

  it('never identifies an account whose answer was no', async () => {
    const { analytics } = await load();
    analytics.linkAccount({ id: 'u1', email: 'a@b.c', analyticsConsent: false });
    expect(posthog.init).not.toHaveBeenCalled();
    expect(posthog.identify).not.toHaveBeenCalled();
  });

  it("pushes this browser's answer to an account that has none yet", async () => {
    const { analytics } = await load({ jlog_analytics_consent: 'granted' });
    analytics.linkAccount({ id: 'u1', email: 'a@b.c', analyticsConsent: null });
    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ granted: true });
  });
});
