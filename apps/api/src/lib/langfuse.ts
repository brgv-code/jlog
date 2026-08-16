import { Langfuse } from 'langfuse';
import type { Env } from '../index';

/**
 * Returns null when tracing isn't configured (e.g. a contributor's local
 * .dev.vars with no Langfuse keys set) — callers treat every trace/generation
 * call as optional via `?.` so tracing being off never affects the actual response.
 */
export function getLangfuse(env: Env): Langfuse | null {
  if (!env.LANGFUSE_PUBLIC_KEY || !env.LANGFUSE_SECRET_KEY) return null;

  return new Langfuse({
    publicKey: env.LANGFUSE_PUBLIC_KEY,
    secretKey: env.LANGFUSE_SECRET_KEY,
    baseUrl: env.LANGFUSE_BASE_URL ?? 'https://cloud.langfuse.com',
  });
}
