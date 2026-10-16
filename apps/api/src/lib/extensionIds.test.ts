import { describe, expect, it } from 'vitest';
import { extensionOrigins, isTrustedExtensionOrigin, parseExtensionIds } from './extensionIds';

const STORE = 'ghianoebaadfaoheimmapmbdbljppmcb';
const DEV = 'enonliciopahgdejgpdjaeadebclgjom';

describe('extension IDs', () => {
  it('reads a single ID, as older configs have it', () => {
    expect(parseExtensionIds(DEV)).toEqual([DEV]);
  });

  it('reads several, separated by commas and spaces', () => {
    expect(parseExtensionIds(` ${STORE}, ${DEV} `)).toEqual([STORE, DEV]);
    expect(parseExtensionIds(`${STORE}\n${DEV}`)).toEqual([STORE, DEV]);
  });

  it('trusts nothing when unset or empty', () => {
    expect(parseExtensionIds(undefined)).toEqual([]);
    expect(extensionOrigins(' , ')).toEqual([]);
    expect(isTrustedExtensionOrigin('', 'chrome-extension://')).toBe(false);
  });

  it('trusts each listed extension and no other', () => {
    const raw = `${STORE},${DEV}`;
    expect(isTrustedExtensionOrigin(raw, `chrome-extension://${STORE}`)).toBe(true);
    expect(isTrustedExtensionOrigin(raw, `chrome-extension://${DEV}`)).toBe(true);
    expect(
      isTrustedExtensionOrigin(raw, 'chrome-extension://someotherextensionidxxxxxxxxxxxx'),
    ).toBe(false);
    expect(isTrustedExtensionOrigin(raw, `https://${STORE}`)).toBe(false);
  });
});
