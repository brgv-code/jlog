import { createDb, llmConfigs } from '@jlog/db';
import { extractedJobSchema, listModelIds, makeProvider } from '@jlog/llm';
import {
  type CatalogueProvider,
  HttpError,
  LLMError,
  extractSchema,
  llmConfigSchema,
  llmModelsRequestSchema,
} from '@jlog/shared';
import { budgetFor, effortFor, modelsFor } from '@jlog/shared/models';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { cfAccessHeadersFor } from '../lib/cfAccess';
import { isDemoUser } from '../lib/demo/account';
import { DEMO_LATENCY_MS, demoExtract, sleep } from '../lib/demo/model';
import { decrypt, encrypt } from '../lib/encryption';
import { callAttributes } from '../lib/langfuse';
import { loadCatalogue, lookupModel } from '../lib/models';
import { requireSession } from '../lib/session';

type AppContext = { Bindings: Env; Variables: Variables };

const router = new Hono<AppContext>();

router.get('/config', async (c) => {
  const session = requireSession(c);
  const db = createDb(c.env.DB);

  const [row] = await db.select().from(llmConfigs).where(eq(llmConfigs.userId, session.userId));

  if (!row) {
    return c.json({ config: null });
  }

  return c.json({
    config: {
      provider: row.provider,
      model: row.model,
      ollamaUrl: row.ollamaUrl ?? null,
      reasoningEffort: row.reasoningEffort ?? 'default',
      hasApiKey: row.apiKeyEncrypted !== null && row.apiKeyEncrypted !== '',
    },
  });
});

router.put('/config', async (c) => {
  const session = requireSession(c);

  const body = await c.req.json().catch(() => {
    throw new HttpError(400, 'INVALID_JSON', 'Request body must be valid JSON');
  });

  const parsed = llmConfigSchema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(400, 'VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid body');
  }

  if (await isDemoUser(c.env.DB, session.userId)) {
    throw new HttpError(
      403,
      'DEMO_ACCOUNT',
      'The demo account uses a built-in model. Sign up to connect your own provider.',
    );
  }

  const data = parsed.data;
  const db = createDb(c.env.DB);
  const now = new Date();

  const [existing] = await db
    .select()
    .from(llmConfigs)
    .where(eq(llmConfigs.userId, session.userId));

  let apiKeyEncrypted: string | null = existing?.apiKeyEncrypted ?? null;

  if (data.apiKey !== undefined && data.apiKey !== '') {
    apiKeyEncrypted = await encrypt(data.apiKey, c.env.ENCRYPTION_SECRET);
  }

  await db
    .insert(llmConfigs)
    .values({
      userId: session.userId,
      provider: data.provider,
      model: data.model,
      apiKeyEncrypted,
      ollamaUrl: data.ollamaUrl ?? null,
      reasoningEffort: data.reasoningEffort ?? 'default',
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: llmConfigs.userId,
      set: {
        provider: data.provider,
        model: data.model,
        apiKeyEncrypted,
        ollamaUrl: data.ollamaUrl ?? null,
        reasoningEffort: data.reasoningEffort ?? 'default',
        updatedAt: now,
      },
    });

  return c.json({
    config: {
      provider: data.provider,
      model: data.model,
      ollamaUrl: data.ollamaUrl ?? null,
      reasoningEffort: data.reasoningEffort ?? 'default',
      hasApiKey: apiKeyEncrypted !== null && apiKeyEncrypted !== '',
    },
  });
});

const LATEST = 5;

router.post('/models', async (c) => {
  const session = requireSession(c);
  const body = await c.req.json().catch(() => ({}));
  const parsed = llmModelsRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(400, 'VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid body');
  }
  const provider: CatalogueProvider = parsed.data.provider;

  const { models: catalogue, source } = await loadCatalogue();
  const models = modelsFor(catalogue, provider);

  let apiKey = parsed.data.apiKey || undefined;
  if (!apiKey && !(await isDemoUser(c.env.DB, session.userId))) {
    const db = createDb(c.env.DB);
    const [row] = await db.select().from(llmConfigs).where(eq(llmConfigs.userId, session.userId));
    if (row?.provider === provider && row.apiKeyEncrypted) {
      apiKey = await decrypt(row.apiKeyEncrypted, c.env.ENCRYPTION_SECRET).catch(() => undefined);
    }
  }
  const available = apiKey ? await listModelIds(provider, apiKey).catch(() => null) : null;

  return c.json({
    models,
    latest: models.slice(0, LATEST).map((m) => m.id),
    available,
    source,
  });
});

export default router;

export const extractRouter = new Hono<AppContext>();

extractRouter.post('/', async (c) => {
  const session = requireSession(c);

  const body = await c.req.json().catch(() => {
    throw new HttpError(400, 'INVALID_JSON', 'Request body must be valid JSON');
  });

  const parsed = extractSchema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(400, 'VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid body');
  }

  const { html } = parsed.data;
  const db = createDb(c.env.DB);

  if (await isDemoUser(c.env.DB, session.userId)) {
    await sleep(DEMO_LATENCY_MS.extract);
    const result = demoExtract(html, parsed.data.url);
    if (!result.company || !result.role) {
      return c.json(
        {
          error: {
            code: 'EXTRACTION_FAILED',
            message:
              'Could not identify company or role from this page. Try on a page with a visible job posting.',
          },
        },
        422,
      );
    }
    return c.json(result);
  }

  const [row] = await db.select().from(llmConfigs).where(eq(llmConfigs.userId, session.userId));

  if (!row) {
    throw new HttpError(400, 'LLM_NOT_CONFIGURED', 'Configure an LLM provider in settings first');
  }

  let apiKey: string | undefined;
  try {
    apiKey = row.apiKeyEncrypted
      ? await decrypt(row.apiKeyEncrypted, c.env.ENCRYPTION_SECRET)
      : undefined;
  } catch {
    throw new HttpError(
      400,
      'LLM_CONFIG_ERROR',
      'Failed to decrypt API key — re-save your LLM settings',
    );
  }

  const cfAccessHeaders = cfAccessHeadersFor(c.env, row.ollamaUrl);

  const config = {
    provider: row.provider,
    model: row.model,
    ...(apiKey !== undefined ? { apiKey } : {}),
    ...(row.ollamaUrl !== null ? { ollamaUrl: row.ollamaUrl } : {}),
    ...(cfAccessHeaders !== undefined ? { extraHeaders: cfAccessHeaders } : {}),
  };

  const content = html.slice(0, 6000);
  const traced = c.var.tracing?.start(
    {
      traceName: 'extract-job',
      userId: session.userId,
      tags: ['extraction', row.provider],
      metadata: { provider: row.provider, model: row.model },
    },
    { url: parsed.data.url, content },
  );
  const lookup = traced?.span('lookup-model');
  const info = await lookupModel(row.provider, row.model);
  lookup?.end();
  const reasoningEffort = effortFor(info, row.reasoningEffort);
  const maxTokens = budgetFor(info, 1024);
  const generation = traced?.generation('extract-job-llm-call', {
    model: row.model,
    modelParameters: { maxTokens, ...(reasoningEffort ? { reasoningEffort } : {}) },
    input: content,
  });

  try {
    const result = await makeProvider(config).extractJSON(
      'Extract the job details from the following job posting content:',
      extractedJobSchema,
      content,
      {
        maxTokens,
        timeoutMs: 60_000,
        ...(reasoningEffort ? { reasoningEffort } : {}),
        onResponse: (report) => generation?.update(callAttributes(report)),
      },
    );

    generation?.update({ output: result }).end();

    if (!result.company || !result.role) {
      traced?.root.update({ output: result, metadata: { extractionFailed: true } });
      return c.json(
        {
          error: {
            code: 'EXTRACTION_FAILED',
            message:
              'Could not identify company or role from this page. Try on a page with a visible job posting.',
          },
        },
        422,
      );
    }

    traced?.root.update({ output: result });
    return c.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    generation?.update({ output: null, level: 'ERROR', statusMessage: message }).end();
    traced?.root.update({ output: null, level: 'ERROR', statusMessage: message });

    if (e instanceof LLMError) {
      return c.json({ error: { code: 'EXTRACTION_FAILED', message: e.message } }, 422);
    }
    throw e;
  }
});
