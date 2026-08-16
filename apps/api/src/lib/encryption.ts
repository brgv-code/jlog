// AES-GCM encryption for LLM API keys using Web Crypto API only
// Compatible with the Cloudflare Workers runtime

const PBKDF2_ITERATIONS = 100_000;

async function deriveKey(secret: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function toBase64(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** Encrypt a plaintext string. Returns '<base64salt>:<base64iv>:<base64ciphertext>' */
export async function encrypt(plaintext: string, secret: string): Promise<string> {
  // A fresh salt per encryption means a leaked secret doesn't let an attacker crack
  // every stored key in one pass — each one needs its own PBKDF2 derivation.
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(secret, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

  return `${toBase64(salt.buffer)}:${toBase64(iv.buffer)}:${toBase64(ciphertext)}`;
}

/** Decrypt a stored string produced by `encrypt`. Returns the original plaintext. */
export async function decrypt(stored: string, secret: string): Promise<string> {
  const parts = stored.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted value format');
  const [saltB64, ivB64, ciphertextB64] = parts as [string, string, string];

  const salt = fromBase64(saltB64);
  const iv = fromBase64(ivB64);
  const ciphertext = fromBase64(ciphertextB64);

  const key = await deriveKey(secret, salt);

  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);

  return new TextDecoder().decode(decrypted);
}
