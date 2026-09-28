import type { Env } from '../index';

/**
 * The Cloudflare Access service token, as headers, for one Ollama URL, or
 * nothing.
 *
 * The token exists so the instance owner can reach their own Ollama behind a
 * Cloudflare Tunnel. The Ollama URL, though, is whatever a signed-in user saved
 * in their settings. Attaching the token to every Ollama request handed it to
 * anyone who pointed their URL at a server they control. So it goes only to the
 * one host named in CF_ACCESS_HOST, over https, and with no host configured it
 * goes nowhere.
 */
export function cfAccessHeadersFor(
  env: Pick<Env, 'CF_ACCESS_CLIENT_ID' | 'CF_ACCESS_CLIENT_SECRET' | 'CF_ACCESS_HOST'>,
  ollamaUrl: string | null,
): Record<string, string> | undefined {
  const { CF_ACCESS_CLIENT_ID: id, CF_ACCESS_CLIENT_SECRET: secret } = env;
  const host = env.CF_ACCESS_HOST?.trim().toLowerCase();
  if (!id || !secret || !host || !ollamaUrl) return undefined;

  let url: URL;
  try {
    url = new URL(ollamaUrl);
  } catch {
    return undefined;
  }

  // Exact host, not a suffix: "ollama.example.com.evil.dev" and
  // "evil-ollama.example.com" must not qualify.
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== host) return undefined;

  return { 'CF-Access-Client-Id': id, 'CF-Access-Client-Secret': secret };
}
