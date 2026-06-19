import { events, createDb } from '@jlog/db';
import { applications } from '@jlog/db';
import { HttpError } from '@jlog/shared';
import { and, asc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Env, Variables } from '../index';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

function requireSession(c: { var: { session: { userId: string; sessionId: string } | null } }) {
  const session = c.var.session;
  if (!session) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Not authenticated');
  }
  return session;
}

// POST /:id/events — log a follow_up_sent event
router.post('/:id/events', async (c) => {
  const session = requireSession(c);
  const { id } = c.req.param();
  const db = createDb(c.env.DB);

  const [application] = await db
    .select()
    .from(applications)
    .where(and(eq(applications.id, id), eq(applications.userId, session.userId)));

  if (!application) {
    throw new HttpError(404, 'NOT_FOUND', 'Application not found');
  }

  const body = await c.req.json().catch(() => {
    throw new HttpError(400, 'INVALID_JSON', 'Request body must be valid JSON');
  });

  const { channel } = body as { channel?: string };
  if (channel !== 'email' && channel !== 'whatsapp') {
    throw new HttpError(400, 'VALIDATION_ERROR', 'channel must be "email" or "whatsapp"');
  }

  await db.insert(events).values({
    id: crypto.randomUUID(),
    applicationId: id,
    type: 'follow_up_sent',
    payload: JSON.stringify({ channel }),
    createdAt: new Date(),
  });

  return c.json({ ok: true });
});

// GET /:id/events — list events for an application
router.get('/:id/events', async (c) => {
  const session = requireSession(c);
  const { id } = c.req.param();
  const db = createDb(c.env.DB);

  // Verify the application belongs to the session user
  const [application] = await db
    .select()
    .from(applications)
    .where(and(eq(applications.id, id), eq(applications.userId, session.userId)));

  if (!application) {
    throw new HttpError(404, 'NOT_FOUND', 'Application not found');
  }

  const rows = await db
    .select()
    .from(events)
    .where(eq(events.applicationId, id))
    .orderBy(asc(events.createdAt));

  return c.json({ events: rows });
});

export default router;
