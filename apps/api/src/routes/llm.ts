import { createDb, llmConfigs } from '@jlog/db';
import { extractedJobSchema, makeProvider } from '@jlog/llm';
import { HttpError, LLMError, extractSchema, llmConfigSchema } from '@jlog/shared';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { decrypt, encrypt } from '../lib/encryption';

type AppContext = { Bindings: Env; Variables: Variables };

const router = new Hono<AppContext>();

function requireSession(c: { var: { session: { userId: string; sessionId: string } | null } }) {
  const session = c.var.session;
  if (!session) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Not authenticated');
  }
  return session;
}

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
    apiKeyEncrypted = await encrypt(data.apiKey, c.env.SESSION_SECRET);
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
  const session = c.var.session;
  if (!session) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Not authenticated');
  }

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
      ? await decrypt(row.apiKeyEncrypted, c.env.SESSION_SECRET)
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

  try {
    const result = await makeProvider(config).extractJSON(
      'Extract the job details from the following job posting content:',
      extractedJobSchema,
      html.slice(0, 6000),
    );
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
  } catch (e) {
    if (e instanceof LLMError) {
      return c.json({ error: { code: 'EXTRACTION_FAILED', message: e.message } }, 422);
    }
    throw e;
  }
});
