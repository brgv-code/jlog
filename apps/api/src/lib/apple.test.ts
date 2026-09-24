import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../index';
import { getAppleClientSecret, isAppleConfigured } from './apple';

/**
 * Apple's client secret is the one credential jlog signs itself, and it cannot
 * be exercised by signing in — a wrong signature simply comes back from Apple
 * as an opaque `invalid_client`. So it is verified here instead: real key, real
 * signature, checked against the matching public key.
 */

function base64UrlToBytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
  return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
}

function decodeSegment(segment: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(segment)));
}

/** Split a JWT, asserting it has the three parts a JWT is supposed to have. */
function parts(token: string): { header: string; payload: string; signature: string } {
  const [header, payload, signature] = token.split('.');
  if (!header || !payload || !signature) throw new Error(`not a JWT: ${token}`);
  return { header, payload, signature };
}

/** A throwaway P-256 pair, exported as the PEM shape Apple's `.p8` file uses. */
async function makeKeyPair() {
  // generateKey is typed as returning either a single key or a pair; for ECDSA
  // it is always a pair.
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;

  // exportKey is typed as possibly returning a JWK; the 'pkcs8' format always
  // yields an ArrayBuffer.
  const pkcs8 = new Uint8Array(
    (await crypto.subtle.exportKey('pkcs8', pair.privateKey)) as ArrayBuffer,
  );
  const base64 = btoa(String.fromCharCode(...pkcs8));
  const wrapped = base64.match(/.{1,64}/g)?.join('\n') ?? base64;

  return {
    publicKey: pair.publicKey,
    pem: `-----BEGIN PRIVATE KEY-----\n${wrapped}\n-----END PRIVATE KEY-----\n`,
  };
}

function envWith(pem: string, keyId: string): Env {
  return {
    APPLE_CLIENT_ID: 'dev.jlog.web',
    APPLE_TEAM_ID: 'TEAM123456',
    APPLE_KEY_ID: keyId,
    APPLE_PRIVATE_KEY: pem,
  } as unknown as Env;
}

describe('getAppleClientSecret', () => {
  it('signs a token Apple can verify with the matching public key', async () => {
    const { pem, publicKey } = await makeKeyPair();
    const token = await getAppleClientSecret(envWith(pem, 'KEYAAAAAA1'));

    const { header, payload, signature } = parts(token);

    // Apple rejects anything but ES256, and needs the key id to know which of
    // your keys to check the signature against.
    expect(decodeSegment(header)).toMatchObject({ alg: 'ES256', kid: 'KEYAAAAAA1', typ: 'JWT' });

    const claims = decodeSegment(payload);
    expect(claims).toMatchObject({
      iss: 'TEAM123456',
      aud: 'https://appleid.apple.com',
      // The Services ID, not the bundle id — a common way to get this wrong.
      sub: 'dev.jlog.web',
    });

    const verified = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      base64UrlToBytes(signature),
      new TextEncoder().encode(`${header}.${payload}`),
    );
    expect(verified).toBe(true);
  });

  it('produces a raw 64-byte signature rather than a DER one', async () => {
    const { pem } = await makeKeyPair();
    const token = await getAppleClientSecret(envWith(pem, 'KEYAAAAAA2'));

    // JWS ES256 is the raw r‖s pair. A DER-wrapped signature is a different
    // length and Apple rejects it, so this is worth pinning down.
    expect(base64UrlToBytes(parts(token).signature).length).toBe(64);
  });

  it('expires within the six months Apple allows', async () => {
    const { pem } = await makeKeyPair();
    const token = await getAppleClientSecret(envWith(pem, 'KEYAAAAAA3'));

    const claims = decodeSegment(parts(token).payload) as unknown as { iat: number; exp: number };
    const nowSeconds = Math.floor(Date.now() / 1000);

    expect(claims.exp).toBeGreaterThan(nowSeconds);
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(15_777_000);
  });

  it('accepts a key whose newlines arrived escaped', async () => {
    const { pem, publicKey } = await makeKeyPair();
    // How the same value usually arrives when pasted into a dashboard field or
    // a .dev.vars line rather than set with `wrangler secret put`.
    const escaped = pem.replace(/\n/g, '\\n');

    const token = await getAppleClientSecret(envWith(escaped, 'KEYAAAAAA4'));
    const { header, payload, signature } = parts(token);

    const verified = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      base64UrlToBytes(signature),
      new TextEncoder().encode(`${header}.${payload}`),
    );
    expect(verified).toBe(true);
  });

  it('reuses a cached token for the same key, and re-signs for a new one', async () => {
    const { pem } = await makeKeyPair();

    const first = await getAppleClientSecret(envWith(pem, 'KEYAAAAAA5'));
    const again = await getAppleClientSecret(envWith(pem, 'KEYAAAAAA5'));
    expect(again).toBe(first);

    // A rotated key must not keep serving the previous key's token.
    const rotated = await getAppleClientSecret(envWith(pem, 'KEYAAAAAA6'));
    expect(rotated).not.toBe(first);
  });

  it('rejects a malformed private key rather than returning a bad token', async () => {
    // The callers depend on this being a rejection: `getAuth` catches it and
    // drops Apple, and `resolvedProviders` catches it and stops the login page
    // offering a button that cannot work. A silently bogus token would defeat
    // both and surface as an opaque `invalid_client` from Apple instead.
    const broken = envWith(
      '-----BEGIN PRIVATE KEY-----\nnot-a-key\n-----END PRIVATE KEY-----',
      'KEYBROKEN1',
    );
    await expect(getAppleClientSecret(broken)).rejects.toThrow();
  });

  it('remembers a bad key instead of retrying it on every request', async () => {
    const broken = envWith(
      '-----BEGIN PRIVATE KEY-----\nstill-not-a-key\n-----END PRIVATE KEY-----',
      'KEYBROKEN2',
    );
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      // `getAuth` swallows this failure so the rest of the API keeps serving,
      // which means the call recurs on *every* request. Without a remembered
      // failure, one mistyped secret would re-import the key and write a log
      // line each time.
      await expect(getAppleClientSecret(broken)).rejects.toThrow();
      await expect(getAppleClientSecret(broken)).rejects.toThrow();
      await expect(getAppleClientSecret(broken)).rejects.toThrow();

      expect(logged).toHaveBeenCalledTimes(1);
    } finally {
      logged.mockRestore();
    }
  });

  it('retries once the key material is corrected', async () => {
    // The flip side of remembering a failure: a fixed key must take effect at
    // once, not merely whenever the isolate happens to recycle. Same key id,
    // new material.
    const badPem = '-----BEGIN PRIVATE KEY-----\nbroken\n-----END PRIVATE KEY-----';
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await expect(getAppleClientSecret(envWith(badPem, 'KEYFIXED001'))).rejects.toThrow();

      const { pem } = await makeKeyPair();
      const token = await getAppleClientSecret(envWith(pem, 'KEYFIXED001'));
      expect(parts(token).signature).toBeTruthy();
    } finally {
      logged.mockRestore();
    }
  });

  it('refuses to sign when the configuration is incomplete', async () => {
    const { pem } = await makeKeyPair();
    const partial = { APPLE_CLIENT_ID: 'dev.jlog.web', APPLE_PRIVATE_KEY: pem } as unknown as Env;

    expect(isAppleConfigured(partial)).toBe(false);
    await expect(getAppleClientSecret(partial)).rejects.toThrow(/missing/i);
  });
});
