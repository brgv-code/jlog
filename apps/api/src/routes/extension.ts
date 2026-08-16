import { createDb, sessions } from '@jlog/db';
import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { requireSession } from '../lib/session';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /api/extension/token — generate a Bearer token for the Chrome extension
// Auth-guarded: requires an active browser session (cookie)
router.get('/token', async (c) => {
  const session = requireSession(c);

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h TTL

  const db = createDb(c.env.DB);
  await db.insert(sessions).values({
    id: token,
    userId: session.userId,
    type: 'extension',
    expiresAt,
  });

  return c.json({ token });
});

export default router;
