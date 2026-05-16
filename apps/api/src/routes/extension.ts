import { createDb, sessions } from '@jlog/db';
import { HttpError } from '@jlog/shared';
import { Hono } from 'hono';
import type { Env, Variables } from '../index';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /api/extension/token — generate a Bearer token for the Chrome extension
// Auth-guarded: requires an active browser session (cookie)
router.get('/token', async (c) => {
  const session = c.var.session;
  if (!session) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Not authenticated');
  }

  const token = crypto.randomUUID();
  const sessionId = `ext_${token}`;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h TTL

  const db = createDb(c.env.DB);
  await db.insert(sessions).values({
    id: sessionId,
    userId: session.userId,
    expiresAt,
  });

  return c.json({ token });
});

export default router;
