import { createDb, llmConfigs } from '@jlog/db';
import { extractedJobSchema, makeProvider } from '@jlog/llm';
import { HttpError, LLMError, extractSchema, llmConfigSchema } from '@jlog/shared';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { decrypt, encrypt } from '../lib/encryption';
import { getLangfuse } from '../lib/langfuse';
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
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: llmConfigs.userId,
      set: {
        provider: data.provider,
        model: data.model,
        apiKeyEncrypted,
        ollamaUrl: data.ollamaUrl ?? null,
        updatedAt: now,
      },
    });

  return c.json({
    config: {
      provider: data.provider,
      model: data.model,
      ollamaUrl: data.ollamaUrl ?? null,
      hasApiKey: apiKeyEncrypted !== null && apiKeyEncrypted !== '',
    },
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

  const content = html.slice(0, 6000);
  const langfuse = getLangfuse(c.env);
  const trace = langfuse?.trace({
    name: 'extract-job',
    userId: session.userId,
    input: { url: parsed.data.url, content },
    metadata: { provider: row.provider, model: row.model },
    tags: ['extraction', row.provider],
  });
  const generation = trace?.generation({
    name: 'extract-job-llm-call',
    model: row.model,
    input: content,
  });

  try {
    const result = await makeProvider(config).extractJSON(
      'Extract the job details from the following job posting content:',
      extractedJobSchema,
      content,
    );

    generation?.end({ output: result });

    if (!result.company || !result.role) {
      trace?.update({ output: result, metadata: { extractionFailed: true } });
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

    trace?.update({ output: result });
    return c.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    generation?.end({ output: null, level: 'ERROR', statusMessage: message });
    trace?.update({ output: null, metadata: { error: message } });

    if (e instanceof LLMError) {
      return c.json({ error: { code: 'EXTRACTION_FAILED', message: e.message } }, 422);
    }
    throw e;
  } finally {
    // Workers tear down the isolate right after the response is sent, so the
    // background flush has to be handed to waitUntil to actually complete.
    if (langfuse) c.executionCtx.waitUntil(langfuse.flushAsync());
  }
});
