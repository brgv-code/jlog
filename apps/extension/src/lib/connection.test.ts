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
