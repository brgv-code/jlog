import { createDb, extensionKeys } from '@jlog/db';
import { HttpError, expiryFromLifetime, extensionTokenSchema, isNeverExpiring } from '@jlog/shared';
import { and, eq, like, lt } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { requireSession } from '../lib/session';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * The public handle for a key, used in the revoke list and the revoke URL. The
 * key itself is the row's primary key and must never leave the server again
 * after it is shown once, so the list identifies a key by its opening
 * characters — the same thing the user saw when they copied it, and far too
 * short to authenticate with.
 */
const PREFIX_LENGTH = 8;
const prefixOf = (token: string) => token.slice(0, PREFIX_LENGTH);

/** `null` is how a non-expiring key is described to any client. */
const publicExpiry = (expiresAt: Date) =>
  isNeverExpiring(expiresAt) ? null : expiresAt.toISOString();

/**
 * Expired keys are left in the table by the auth middleware so the popup can be
 * told *why* it is locked out. They get cleared here instead: these are the
 * cookie-authenticated paths, so the sweep costs a signed-in user one write and
 * never slows down the extension's own requests.
 *
 * No `type` filter any more — this table holds nothing but extension keys.
 */
async function pruneExpired(db: ReturnType<typeof createDb>, userId: string): Promise<void> {
  await db
    .delete(extensionKeys)
    .where(and(eq(extensionKeys.userId, userId), lt(extensionKeys.expiresAt, new Date())));
}

/**
 * GET /api/extension/session — "is this key still good, and when does it die?"
 *
 * Always answers 200, even when the answer is no. The popup calls this on every
 * open, and a 401 here would be indistinguishable from the network being down,
 * which is exactly the ambiguity that made an expired key look like a broken
 * extension.
 */
router.get('/session', async (c) => {
  const session = c.var.session;
  if (session?.type === 'extension') {
    return c.json({
      status: 'active' as const,
      expiresAt: publicExpiry(session.expiresAt),
      label: session.label,
    });
  }

  const expired = c.var.expiredSession;
  if (expired) {
    return c.json({
      status: 'expired' as const,
      expiresAt: expired.expiresAt.toISOString(),
      label: expired.label,
    });
  }

  return c.json({ status: 'unknown' as const, expiresAt: null, label: null });
});

/**
 * POST /api/extension/token — mint a key for the Chrome extension.
 * Cookie-authenticated: only a signed-in browser session can create one.
 */
router.post('/token', async (c) => {
  const session = requireSession(c);

  // An empty body still means "use the defaults" rather than "bad request" —
  // the lifetime picker is the only input and it always has a selection.
  const body = await c.req.json().catch(() => ({}));
  const parsed = extensionTokenSchema.safeParse(body ?? {});
  if (!parsed.success) {
    throw new HttpError(400, 'VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid body');
  }
  const { expiresIn, label } = parsed.data;

  const token = crypto.randomUUID();
  const expiresAt = expiryFromLifetime(expiresIn);

  const db = createDb(c.env.DB);
  await pruneExpired(db, session.userId);
  await db.insert(extensionKeys).values({
    id: token,
    userId: session.userId,
    label: label && label.length > 0 ? label : null,
    createdAt: new Date(),
    expiresAt,
  });

  return c.json({
    token,
    prefix: prefixOf(token),
    expiresAt: publicExpiry(expiresAt),
    label: label ?? null,
  });
});

/** GET /api/extension/tokens — the revoke list. Never includes a usable key. */
router.get('/tokens', async (c) => {
  const session = requireSession(c);
  const db = createDb(c.env.DB);
  await pruneExpired(db, session.userId);

  const rows = await db
    .select()
    .from(extensionKeys)
    .where(eq(extensionKeys.userId, session.userId));

  const tokens = rows
    .map((row) => ({
      prefix: prefixOf(row.id),
      label: row.label,
      createdAt: row.createdAt?.toISOString() ?? null,
      expiresAt: publicExpiry(row.expiresAt),
    }))
    // Newest first; keys minted before created_at existed sort last.
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));

  return c.json({ tokens });
});

/**
 * DELETE /api/extension/tokens/:prefix — revoke a key immediately.
 *
 * Matching on the prefix rather than the whole key is what lets the list stay
 * safe to hand out. Scoped to the caller's own rows, so the worst a prefix
 * collision can do is revoke two of your own keys at once.
 */
router.delete('/tokens/:prefix', async (c) => {
  const session = requireSession(c);
  const prefix = c.req.param('prefix');

  if (!/^[0-9a-f]{8}$/i.test(prefix)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Not a key prefix');
  }

  const db = createDb(c.env.DB);
  await db
    .delete(extensionKeys)
    .where(and(eq(extensionKeys.userId, session.userId), like(extensionKeys.id, `${prefix}%`)));

  return c.json({ ok: true });
});

export default router;
