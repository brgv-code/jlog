import { createDb, llmConfigs } from '@jlog/db';
import { makeProvider, rawJsonSchema } from '@jlog/llm';
import type { TailorJson, TailorRequest } from '@jlog/pro';
import { budgetFor, effortFor } from '@jlog/shared/models';
import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import type { Env, Variables } from '../index';
import { cfAccessHeadersFor } from './cfAccess';
import { isDemoUser } from './demo/account';
import { demoJsonCaller } from './demo/model';
import { decrypt } from './encryption';
import { callAttributes } from './langfuse';
import { lookupModel } from './models';

type AppContext = { Bindings: Env; Variables: Variables };

export async function makeJsonCaller(
  c: Context<AppContext>,
  trace: { name: string; tags: string[] },
): Promise<TailorJson | null> {
  const session = c.var.session;
  if (!session) return null;

  if (await isDemoUser(c.env.DB, session.userId)) return demoJsonCaller;

  const db = createDb(c.env.DB);
  const [row] = await db.select().from(llmConfigs).where(eq(llmConfigs.userId, session.userId));
  if (!row) return null;

  let apiKey: string | undefined;
  try {
    apiKey = row.apiKeyEncrypted
      ? await decrypt(row.apiKeyEncrypted, c.env.ENCRYPTION_SECRET)
      : undefined;
  } catch {
    return null;
  }

  const cfAccessHeaders = cfAccessHeadersFor(c.env, row.ollamaUrl);

  const config = {
    provider: row.provider,
    model: row.model,
    ...(apiKey !== undefined ? { apiKey } : {}),
    ...(row.ollamaUrl !== null ? { ollamaUrl: row.ollamaUrl } : {}),
    ...(cfAccessHeaders !== undefined ? { extraHeaders: cfAccessHeaders } : {}),
  };

  const traced = c.var.tracing?.start({
    traceName: trace.name,
    userId: session.userId,
    tags: [...trace.tags, row.provider],
    metadata: { provider: row.provider, model: row.model },
  });

  const provider = makeProvider(config);
  const lookup = traced?.span('lookup-model');
  const info = await lookupModel(row.provider, row.model);
  lookup?.end();
  const maxTokens = budgetFor(info, fallbackBudget(row.provider));
  const reasoningEffort = effortFor(info, row.reasoningEffort);

  let rootHasInput = false;

  return async (req: TailorRequest) => {
    const generation = traced?.generation(req.name, {
      model: row.model,
      modelParameters: { maxTokens, ...(reasoningEffort ? { reasoningEffort } : {}) },
      input: { system: req.system, user: req.user },
    });
    if (traced && !rootHasInput) {
      traced.root.update({ input: { system: req.system, user: req.user } });
      rootHasInput = true;
    }
    try {
      const result = await provider.extractJSON('', rawJsonSchema, req.user, {
        system: req.system,
        maxTokens,
        timeoutMs: JSON_CALL_TIMEOUT_MS,
        ...(reasoningEffort ? { reasoningEffort } : {}),
        onResponse: (report) => generation?.update(callAttributes(report)),
      });
      generation?.update({ output: result }).end();
      traced?.root.update({ output: result });
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      generation?.update({ output: null, level: 'ERROR', statusMessage: message }).end();
      throw e;
    }
  };
}

function fallbackBudget(provider: string): number {
  return provider === 'openai' ? 16_384 : 4096;
}

const JSON_CALL_TIMEOUT_MS = 120_000;

export function makeTailor(c: Context<AppContext>): Promise<TailorJson | null> {
  return makeJsonCaller(c, { name: 'tailor-cv', tags: ['tailoring'] });
}

export function makeDrafter(c: Context<AppContext>): Promise<TailorJson | null> {
  return makeJsonCaller(c, { name: 'draft-answer', tags: ['autofill'] });
}
