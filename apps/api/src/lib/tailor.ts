import { createDb, llmConfigs } from '@jlog/db';
import { makeProvider, rawJsonSchema } from '@jlog/llm';
import type { TailorJson, TailorRequest, TraceOptions, TraceStep, TracedLLM } from '@jlog/pro';
import { budgetFor, effortFor } from '@jlog/shared/models';
import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import type { Env, Variables } from '../index';
import { cfAccessHeadersFor } from './cfAccess';
import { isDemoUser } from './demo/account';
import { demoJsonCaller } from './demo/model';
import { decrypt } from './encryption';
import { callAttributes, sessionIdFor, untracedStep } from './langfuse';
import { lookupModel } from './models';

type AppContext = { Bindings: Env; Variables: Variables };

type TraceName = { name: string; tags: string[] };

export async function makeJsonCaller(
  c: Context<AppContext>,
  trace: TraceName,
): Promise<TailorJson | null> {
  return (await startJsonCall(c, trace))?.call ?? null;
}

async function startJsonCall(
  c: Context<AppContext>,
  trace: TraceName,
  options: TraceOptions = {},
): Promise<TracedLLM | null> {
  const session = c.var.session;
  if (!session) return null;

  if (await isDemoUser(c.env.DB, session.userId)) {
    return { call: demoJsonCaller, step: untracedStep };
  }

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
    ...(options.session ? { sessionId: await sessionIdFor(options.session) } : {}),
    tags: [...trace.tags, row.provider],
    metadata: { provider: row.provider, model: row.model },
  });
  const step = traced?.step ?? untracedStep;

  const provider = makeProvider(config);
  const info = await step('lookup-model', () => lookupModel(row.provider, row.model));
  const maxTokens = budgetFor(info, fallbackBudget(row.provider));
  const reasoningEffort = effortFor(info, row.reasoningEffort);

  let rootHasInput = false;

  const call = async (req: TailorRequest) => {
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

  return { call, step };
}

function fallbackBudget(provider: string): number {
  return provider === 'openai' ? 16_384 : 4096;
}

const JSON_CALL_TIMEOUT_MS = 120_000;

export function makeTailor(
  c: Context<AppContext>,
  options?: TraceOptions,
): Promise<TracedLLM | null> {
  return startJsonCall(c, { name: 'tailor-cv', tags: ['tailoring'] }, options);
}

export function makeDrafter(
  c: Context<AppContext>,
  options?: TraceOptions,
): Promise<TracedLLM | null> {
  return startJsonCall(c, { name: 'draft-answer', tags: ['autofill'] }, options);
}

export async function startTrace(c: Context<AppContext>, name: string): Promise<TraceStep> {
  const session = c.var.session;
  if (!session) return untracedStep;
  const traced = c.var.tracing?.start({ traceName: name, userId: session.userId, tags: [name] });
  return traced?.step ?? untracedStep;
}
