// AES-GCM encryption for LLM API keys using Web Crypto API only
// Compatible with the Cloudflare Workers runtime

const SALT = new TextEncoder().encode('jlog-llm-key-v1');
const PBKDF2_ITERATIONS = 100_000;

async function deriveKey(secret: string): Promise<CryptoKey> {
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
      salt: SALT,
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

/** Encrypt a plaintext string. Returns '<base64iv>:<base64ciphertext>' */
export async function encrypt(plaintext: string, secret: string): Promise<string> {
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

  return `${toBase64(iv.buffer)}:${toBase64(ciphertext)}`;
}

/** Decrypt a stored string produced by `encrypt`. Returns the original plaintext. */
export async function decrypt(stored: string, secret: string): Promise<string> {
  const sep = stored.indexOf(':');
  if (sep === -1) throw new Error('Invalid encrypted value format');

  const iv = fromBase64(stored.slice(0, sep));
  const ciphertext = fromBase64(stored.slice(sep + 1));

  const key = await deriveKey(secret);

  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);

  return new TextDecoder().decode(decrypted);
}
