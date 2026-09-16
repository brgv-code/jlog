import { createDb, llmConfigs } from '@jlog/db';
import { makeProvider, rawJsonSchema } from '@jlog/llm';
import type { TailorJson, TailorRequest } from '@jlog/pro';
import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import type { Env, Variables } from '../index';
import { decrypt } from './encryption';
import { getLangfuse } from './langfuse';

type AppContext = { Bindings: Env; Variables: Variables };

/**
 * `@jlog/pro` carries hono and nothing else, so it cannot build a provider or
 * reach Langfuse. It asks for a JSON-returning call instead and this supplies
 * one, using the same per-user encrypted config and the same tracing as
 * `/api/llm/extract` — so tailoring shows up in Langfuse next to extraction
 * rather than in a second, parallel setup (ADR-004).
 */

/**
 * The same provider, key handling and tracing, named for whatever is calling
 * it. CV import needs a JSON-returning model call too, and a second copy of
 * this wiring would be a second place for the encrypted-key handling to drift.
 */
export async function makeJsonCaller(
  c: Context<AppContext>,
  trace: { name: string; tags: string[] },
): Promise<TailorJson | null> {
  const session = c.var.session;
  if (!session) return null;

  const db = createDb(c.env.DB);
  const [row] = await db.select().from(llmConfigs).where(eq(llmConfigs.userId, session.userId));
  if (!row) return null;

  let apiKey: string | undefined;
  try {
    apiKey = row.apiKeyEncrypted
      ? await decrypt(row.apiKeyEncrypted, c.env.ENCRYPTION_SECRET)
      : undefined;
  } catch {
    // A key we cannot decrypt is the same as no provider: the caller's 503
    // tells the user to re-save their LLM settings, which is the actual fix.
    return null;
  }

  const cfAccessHeaders =
    c.env.CF_ACCESS_CLIENT_ID && c.env.CF_ACCESS_CLIENT_SECRET
      ? {
          'CF-Access-Client-Id': c.env.CF_ACCESS_CLIENT_ID,
          'CF-Access-Client-Secret': c.env.CF_ACCESS_CLIENT_SECRET,
        }
      : undefined;

  const config = {
    provider: row.provider,
    model: row.model,
    ...(apiKey !== undefined ? { apiKey } : {}),
    ...(row.ollamaUrl !== null ? { ollamaUrl: row.ollamaUrl } : {}),
    ...(cfAccessHeaders !== undefined ? { extraHeaders: cfAccessHeaders } : {}),
  };

  const provider = makeProvider(config);
  const langfuse = getLangfuse(c.env);
  // One trace per request, spanning every attempt the caller makes. The retries
  // are the interesting part — a run that took three goes is worth seeing as
  // one story rather than three unrelated generations.
  const span = langfuse?.trace({
    name: trace.name,
    userId: session.userId,
    metadata: { provider: row.provider, model: row.model },
    tags: [...trace.tags, row.provider],
  });

  return async (req: TailorRequest) => {
    const generation = span?.generation({
      name: req.name,
      model: row.model,
      input: { system: req.system, user: req.user },
    });
    try {
      // The system prompt must go in as the system prompt. Passed as `prompt`
      // it lands in the user message behind EXTRACT_JOB_SYSTEM_PROMPT, which
      // tells the model to answer with company/role/location instead.
      const result = await provider.extractJSON('', rawJsonSchema, req.user, {
        system: req.system,
        maxTokens: 4096,
      });
      generation?.end({ output: result });
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      generation?.end({ output: null, level: 'ERROR', statusMessage: message });
      throw e;
    }
  };
}

export function makeTailor(c: Context<AppContext>): Promise<TailorJson | null> {
  return makeJsonCaller(c, { name: 'tailor-cv', tags: ['tailoring'] });
}
