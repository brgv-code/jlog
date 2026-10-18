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
import { loadCatalogue, lookupModel } from '../lib/models';
import { requireSession } from '../lib/session';

type AppContext = { Bindings: Env; Variables: Variables };

const router = new Hono<AppContext>();

// GET /config — return current LLM config for the user (never return the raw key)
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

// PUT /config — upsert LLM config
router.put('/config', async (c) => {
  const session = requireSession(c);

  const body = await c.req.json().catch(() => {
    throw new HttpError(400, 'INVALID_JSON', 'Request body must be valid JSON');
  });

  const parsed = llmConfigSchema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(400, 'VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid body');
  }

  // A demo account runs on the built-in demo model, and a key pasted into a
  // throwaway account that is deleted tomorrow is a key nobody meant to store.
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

  // Fetch existing config to preserve API key if not updating
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

/** How many models the dropdown leads with, newest first. */
const LATEST = 5;

/**
 * POST /models — the models a user can pick for one provider (BRG-232).
 *
 * POST rather than GET so a key typed into the form, not yet saved, can be
 * used to check access without landing in a URL or a log. The catalogue answers
 * what exists and what each model can do; the provider's own list, with the
 * key, answers which of those this key may call. `available` is null when that
 * could not be asked (no key, or the provider did not answer), and the form
 * then shows the catalogue without marking anything unavailable.
 */
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

// --- Extract router (wired at /api/extract in index.ts) ---
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
  // The root observation carries the request's overall input and output; the
  // generation under it carries what the model was actually handed. The
  // tracing middleware ends both and exports them.
  const traced = c.var.tracing?.start(
    {
      traceName: 'extract-job',
      userId: session.userId,
      tags: ['extraction', row.provider],
      metadata: { provider: row.provider, model: row.model },
    },
    { url: parsed.data.url, content },
  );
  const generation = traced?.generation('extract-job-llm-call', {
    model: row.model,
    input: content,
  });

  try {
    // Extraction is short, but on a reasoning model the cap covers thinking
    // too, and the old implicit 1024 would be spent before any answer.
    const info = await lookupModel(row.provider, row.model);
    const reasoningEffort = effortFor(info, row.reasoningEffort);
    const result = await makeProvider(config).extractJSON(
      'Extract the job details from the following job posting content:',
      extractedJobSchema,
      content,
      {
        maxTokens: budgetFor(info, 1024),
        timeoutMs: 60_000,
        ...(reasoningEffort ? { reasoningEffort } : {}),
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
