import { describe, expect, it } from 'vitest';
import { activeInviteList, isInviteOnly, isInvited, parseInviteList } from './invites';

describe('invite list', () => {
  it('is open when unset or empty', () => {
    expect(parseInviteList(undefined)).toBeNull();
    expect(parseInviteList('  , ')).toBeNull();
    expect(isInviteOnly('')).toBe(false);
    expect(isInvited(undefined, 'anyone@example.com')).toBe(true);
  });

  it('admits listed addresses, case-insensitively', () => {
    const raw = 'Ada@Example.com, grace@example.org';
    expect(isInviteOnly(raw)).toBe(true);
    expect(isInvited(raw, 'ada@example.com')).toBe(true);
    expect(isInvited(raw, ' GRACE@example.org ')).toBe(true);
    expect(isInvited(raw, 'eve@example.com')).toBe(false);
  });

  it('admits a whole domain with an @ entry', () => {
    const raw = '@jlog.ai\nada@example.com';
    expect(isInvited(raw, 'support@jlog.ai')).toBe(true);
    expect(isInvited(raw, 'someone@notjlog.ai')).toBe(false);
  });

  it('does not treat a domain entry as a suffix match', () => {
    expect(isInvited('@example.com', 'eve@evil-example.com')).toBe(false);
    expect(isInvited('@example.com', 'eve@sub.example.com')).toBe(false);
  });
});

describe('OPEN_SIGNUP', () => {
  const ALLOWED_EMAILS = 'you@example.com';

  it('sets the invite list aside when "true"', () => {
    const list = activeInviteList({ ALLOWED_EMAILS, OPEN_SIGNUP: 'true' });
    expect(isInviteOnly(list)).toBe(false);
    expect(isInvited(list, 'stranger@example.org')).toBe(true);
  });

  it('keeps the invite list otherwise', () => {
    const envs = ['', 'false', 'TRUE'].map((OPEN_SIGNUP) => ({ ALLOWED_EMAILS, OPEN_SIGNUP }));
    for (const env of [{ ALLOWED_EMAILS }, ...envs]) {
      const list = activeInviteList(env);
      expect(isInviteOnly(list)).toBe(true);
      expect(isInvited(list, 'stranger@example.org')).toBe(false);
    }
  });
});
