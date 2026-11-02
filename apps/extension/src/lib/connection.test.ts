import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeExpiry } from './connection';

/**
 * These strings are the popup's entire explanation of why it does or does not
 * work, so they are worth pinning. The bug this whole module exists to fix was
 * an expiry the user was never told about.
 */
describe('describeExpiry', () => {
  afterEach(() => vi.useRealTimers());

  function at(iso: string) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(iso));
  }

  it('says so plainly when a key never expires', () => {
    expect(describeExpiry(null)).toBe('no expiry');
  });

  it('counts down in hours on the last day', () => {
    at('2026-01-01T00:00:00Z');
    expect(describeExpiry(new Date('2026-01-01T05:00:00Z').getTime())).toBe('expires in 5h');
  });

  it('counts down in days further out', () => {
    at('2026-01-01T00:00:00Z');
    expect(describeExpiry(new Date('2026-01-07T00:00:00Z').getTime())).toBe('expires in 6 days');
  });

  it('uses the singular for tomorrow', () => {
    at('2026-01-01T00:00:00Z');
    expect(describeExpiry(new Date('2026-01-02T00:00:00Z').getTime())).toBe('expires tomorrow');
  });

  it('reports a past date as expired rather than a negative countdown', () => {
    at('2026-01-02T00:00:00Z');
    expect(describeExpiry(new Date('2026-01-01T00:00:00Z').getTime())).toBe('expired');
  });
});

describe('checkConnection with a key that cannot be sent', () => {
  let storage: Record<string, unknown>;

  function storeToken(token: string): void {
    storage = { jlog_token: token };
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: (key: string) => Promise.resolve(key in storage ? { [key]: storage[key] } : {}),
          set: (items: Record<string, unknown>) => {
            Object.assign(storage, items);
            return Promise.resolve();
          },
        },
      },
    });
  }

  afterEach(() => vi.unstubAllGlobals());

  // The Settings list shows "a1b2c3d4…", and fetch refuses that ellipsis before
  // any request is made. Calling that offline left the popup on a retry loop.
  it.each([
    ['a copied prefix with its ellipsis', 'a1b2c3d4…'],
    ['a key broken across two lines', 'a1b2c3d4-0000\n-0000-0000-000000000000'],
  ])('calls %s rejected, not offline', async (_case, token) => {
    storeToken(token);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { checkConnection } = await import('./connection');

    const conn = await checkConnection();

    expect(conn.status).toBe('rejected');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
