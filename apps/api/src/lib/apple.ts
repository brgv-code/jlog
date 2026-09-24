import type { Env } from '../index';

/**
 * Apple's "client secret", which is not a secret string.
 *
 * Every other provider hands you a fixed string to keep. Apple hands you a
 * downloadable private key and expects you to sign a fresh, short-lived
 * assertion with it on each token exchange. Better Auth takes the finished
 * token, so producing it is the one piece of Apple's protocol that stays here.
 *
 * Web Crypto rather than a JWT library: this runs on workerd, and ES256 is two
 * calls once the key is in the right shape.
 */

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function textToBase64Url(text: string): string {
  return bytesToBase64Url(new TextEncoder().encode(text));
}

/**
 * Turn the PEM body of a downloaded `.p8` key into the DER bytes `importKey`
 * expects.
 *
 * Secrets set with `wrangler secret put` keep their real newlines, but the same
 * value pasted into a dashboard field or a `.dev.vars` line usually arrives
 * with literal backslash-n instead, so both spellings are accepted.
 */
function pkcs8FromPem(pem: string): Uint8Array {
  const body = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '');

  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Apple permits up to six months, but a long-lived assertion buys nothing when
 * it is minted in-process. An hour is long enough that the cache below does
 * real work and short enough that a leaked one is worth little.
 */
const SECRET_TTL_SECONDS = 60 * 60;
/** Regenerate this long before expiry, so an in-flight exchange never uses a
 * token that dies between being signed and being read. */
const REFRESH_MARGIN_SECONDS = 5 * 60;

/**
 * What this isolate last worked out about the configured key.
 *
 * Signing is cheap but not free, and the credentials arrive per request on
 * workerd rather than per process, so the result is kept between requests.
 *
 * Failures are remembered too, and that is the more important half: a malformed
 * `.p8` is caught by the caller so the rest of the API keeps working, which
 * means every subsequent request would otherwise retry the import and write
 * another error line. One mistyped secret would flood the logs and add
 * cryptographic work to requests that have nothing to do with Apple.
 *
 * Keyed on the key id *and* the key material, so correcting either is noticed
 * immediately rather than being masked until the isolate recycles.
 */
type KeyState =
  | { status: 'signed'; keyId: string; pem: string; expiresAt: number; token: string }
  | { status: 'unusable'; keyId: string; pem: string; reason: string };

let cached: KeyState | null = null;

export function isAppleConfigured(env: Env): boolean {
  return Boolean(
    env.APPLE_CLIENT_ID && env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY,
  );
}

export async function getAppleClientSecret(env: Env): Promise<string> {
  if (!isAppleConfigured(env)) {
    throw new Error('Apple sign-in is missing one of its four settings');
  }

  const keyId = env.APPLE_KEY_ID as string;
  const pem = env.APPLE_PRIVATE_KEY as string;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const sameKey = cached?.keyId === keyId && cached?.pem === pem;

  if (sameKey && cached?.status === 'unusable') {
    // Already established that this exact key cannot sign. Fail immediately,
    // without the import and without logging again.
    throw new Error(cached.reason);
  }

  if (
    sameKey &&
    cached?.status === 'signed' &&
    cached.expiresAt - REFRESH_MARGIN_SECONDS > nowSeconds
  ) {
    return cached.token;
  }

  const expiresAt = nowSeconds + SECRET_TTL_SECONDS;

  const header = textToBase64Url(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }));
  const payload = textToBase64Url(
    JSON.stringify({
      iss: env.APPLE_TEAM_ID,
      iat: nowSeconds,
      exp: expiresAt,
      aud: 'https://appleid.apple.com',
      sub: env.APPLE_CLIENT_ID,
    }),
  );

  let signature: ArrayBuffer;
  try {
    const key = await crypto.subtle.importKey(
      'pkcs8',
      pkcs8FromPem(pem),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign'],
    );

    // Web Crypto returns the raw r‖s pair, which is exactly the 64 bytes JWS
    // ES256 asks for. A DER-encoded signature would be rejected by Apple.
    signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      new TextEncoder().encode(`${header}.${payload}`),
    );
  } catch (err) {
    // Logged here rather than by the caller, and exactly once per bad key: the
    // caller runs on every request, so logging there would turn one mistyped
    // secret into a line per request forever.
    const reason = `Apple sign-in disabled: the private key could not sign (${
      err instanceof Error ? err.message : String(err)
    })`;
    console.error(`[auth] ${reason}`);
    cached = { status: 'unusable', keyId, pem, reason };
    throw new Error(reason);
  }

  const token = `${header}.${payload}.${bytesToBase64Url(new Uint8Array(signature))}`;
  cached = { status: 'signed', keyId, pem, expiresAt, token };
  return token;
}
