import { createDb, uninstallFeedback } from '@jlog/db';
import { HttpError, uninstallFeedbackSchema } from '@jlog/shared';
import { count, gt } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Env, Variables } from '../index';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * Across everyone, not per address. The form is anonymous, so there is no
 * honest key to limit by, and a real wave of uninstalls is nowhere near this.
 * What it bounds is the worst case: someone scripting the endpoint fills at
 * most this many rows an hour, not the database.
 */
export const UNINSTALL_FEEDBACK_HOURLY_CAP = 200;

// POST /uninstall — the form on /extension/uninstalled. No session: the person
// sending it has just removed the extension that held their key.
router.post('/uninstall', async (c) => {
  const body = await c.req.json().catch(() => {
    throw new HttpError(400, 'INVALID_JSON', 'Request body must be valid JSON');
  });

  const parsed = uninstallFeedbackSchema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(400, 'VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid body');
  }
  const { reason, message, email, version, website } = parsed.data;

  // The honeypot. Answered exactly like a real submission, so a bot learns
  // nothing from the response, and stored nowhere.
  if (website) return c.json({ ok: true });

  const db = createDb(c.env.DB);
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [recent] = await db
    .select({ n: count() })
    .from(uninstallFeedback)
    .where(gt(uninstallFeedback.createdAt, hourAgo));
  if ((recent?.n ?? 0) >= UNINSTALL_FEEDBACK_HOURLY_CAP) {
    throw new HttpError(429, 'RATE_LIMITED', 'Too many responses right now. Please try later.');
  }

  await db.insert(uninstallFeedback).values({
    id: crypto.randomUUID(),
    reason,
    message: message || null,
    email: email || null,
    extensionVersion: version ?? null,
    createdAt: new Date(),
  });

  return c.json({ ok: true });
});

export default router;
