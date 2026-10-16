import { describe, expect, it } from 'vitest';
import { loginUrlFor, safeNext } from './next';

describe('safeNext', () => {
  it('keeps a same origin path, query and anchor included', () => {
    expect(safeNext('/settings#extension')).toBe('/settings#extension');
    expect(safeNext('/applications?status=applied')).toBe('/applications?status=applied');
  });

  it('refuses anything a browser would read as another host', () => {
    expect(safeNext('https://evil.com')).toBeNull();
    expect(safeNext('//evil.com')).toBeNull();
    expect(safeNext('/\\evil.com')).toBeNull();
    expect(safeNext('/\t/evil.com')).toBeNull();
    expect(safeNext('javascript:alert(1)')).toBeNull();
  });

  it('refuses a loop back to sign-in, and nothing at all', () => {
    expect(safeNext('/login')).toBeNull();
    expect(safeNext('/login?next=/x')).toBeNull();
    expect(safeNext('')).toBeNull();
    expect(safeNext(null)).toBeNull();
  });
});

describe('loginUrlFor', () => {
  it('carries the anchor the extension links to', () => {
    expect(loginUrlFor({ pathname: '/settings', search: '', hash: '#extension' })).toBe(
      '/login?next=%2Fsettings%23extension',
    );
  });
});
