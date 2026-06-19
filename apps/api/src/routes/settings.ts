import { createDb, users } from '@jlog/db';
import { HttpError } from '@jlog/shared';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Env, Variables } from '../index';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

function requireSession(c: { var: { session: { userId: string; sessionId: string } | null } }) {
  const session = c.var.session;
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Not authenticated');
  return session;
}

router.get('/', async (c) => {
  const session = requireSession(c);
  const db = createDb(c.env.DB);

  const [user] = await db.select().from(users).where(eq(users.id, session.userId));
  if (!user) throw new HttpError(404, 'NOT_FOUND', 'User not found');

  return c.json({ analyticsOptIn: user.analyticsOptIn ?? false });
});

router.put('/', async (c) => {
  const session = requireSession(c);
  const body = await c.req.json().catch(() => {
    throw new HttpError(400, 'INVALID_JSON', 'Request body must be valid JSON');
  });

  const { analyticsOptIn } = body as { analyticsOptIn?: unknown };
  if (typeof analyticsOptIn !== 'boolean') {
    throw new HttpError(400, 'VALIDATION_ERROR', 'analyticsOptIn must be a boolean');
  }

  const db = createDb(c.env.DB);
  await db.update(users).set({ analyticsOptIn }).where(eq(users.id, session.userId));

  return c.json({ analyticsOptIn });
});

export default router;
