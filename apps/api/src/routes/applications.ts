import { events, applications, createDb } from '@jlog/db';
import {
  HttpError,
  createApplicationSchema,
  paginationSchema,
  updateApplicationSchema,
} from '@jlog/shared';
import { and, desc, eq, gt, like, or } from 'drizzle-orm';
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

// GET / — paginated list
router.get('/', async (c) => {
  const session = requireSession(c);
  const query = c.req.query();

  const parsed = paginationSchema.safeParse(query);
  if (!parsed.success) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      parsed.error.errors[0]?.message ?? 'Invalid query params',
    );
  }

  const { cursor, limit, status, sort, q } = parsed.data;
  const db = createDb(c.env.DB);

  const conditions = [eq(applications.userId, session.userId)];

  if (status) {
    conditions.push(eq(applications.status, status));
  }

  if (q) {
    const pattern = `%${q}%`;
    const searchCondition = or(
      like(applications.company, pattern),
      like(applications.role, pattern),
    );
    // or() returns undefined only when called with zero args; here we always pass two, so it is defined
    if (searchCondition) conditions.push(searchCondition);
  }

  // Cursor: use the id of the last seen item for offset-style cursor
  if (cursor) {
    conditions.push(gt(applications.id, cursor));
  }

  const sortCol =
    sort === 'appliedAt'
      ? applications.appliedAt
      : sort === 'company'
        ? applications.company
        : applications.createdAt;

  const rows = await db
    .select()
    .from(applications)
    .where(and(...conditions))
    .orderBy(desc(sortCol))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;

  return c.json({ applications: items, nextCursor });
});

// POST / — create
router.post('/', async (c) => {
  const session = requireSession(c);
  const body = await c.req.json().catch(() => {
    throw new HttpError(400, 'INVALID_JSON', 'Request body must be valid JSON');
  });

  const parsed = createApplicationSchema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(400, 'VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid body');
  }

  const data = parsed.data;
  const now = new Date();
  const id = crypto.randomUUID();

  const db = createDb(c.env.DB);
  await db.insert(applications).values({
    id,
    userId: session.userId,
    company: data.company,
    role: data.role,
    location: data.location ?? null,
    status: data.status,
    sourceUrl: data.sourceUrl ?? null,
    sourceSite: data.sourceSite ?? null,
    appliedAt: data.appliedAt ? new Date(data.appliedAt * 1000) : null,
    notes: data.notes ?? null,
    jobDescription: data.jobDescription ?? null,
    metadata: data.metadata ?? null,
    createdAt: now,
    updatedAt: now,
  });

  const [application] = await db.select().from(applications).where(eq(applications.id, id));
  if (!application) {
    throw new HttpError(500, 'DB_ERROR', 'Failed to retrieve created application');
  }

  // Record the creation event
  await db.insert(events).values({
    id: crypto.randomUUID(),
    applicationId: id,
    type: 'created',
    payload: JSON.stringify({ company: data.company, role: data.role }),
    createdAt: now,
  });

  return c.json({ application }, 201);
});

// GET /:id — single
router.get('/:id', async (c) => {
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

  return c.json({ application });
});

// PATCH /:id — partial update
router.patch('/:id', async (c) => {
  const session = requireSession(c);
  const { id } = c.req.param();

  const body = await c.req.json().catch(() => {
    throw new HttpError(400, 'INVALID_JSON', 'Request body must be valid JSON');
  });

  const parsed = updateApplicationSchema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(400, 'VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid body');
  }

  const data = parsed.data;
  const db = createDb(c.env.DB);

  const [existing] = await db
    .select()
    .from(applications)
    .where(and(eq(applications.id, id), eq(applications.userId, session.userId)));

  if (!existing) {
    throw new HttpError(404, 'NOT_FOUND', 'Application not found');
  }

  const updateValues: Partial<typeof existing> & { updatedAt: Date } = {
    updatedAt: new Date(),
  };

  if (data.company !== undefined) updateValues.company = data.company;
  if (data.role !== undefined) updateValues.role = data.role;
  if (data.location !== undefined) updateValues.location = data.location;
  if (data.status !== undefined) updateValues.status = data.status;
  if (data.sourceUrl !== undefined) updateValues.sourceUrl = data.sourceUrl;
  if (data.sourceSite !== undefined) updateValues.sourceSite = data.sourceSite;
  if (data.appliedAt !== undefined)
    updateValues.appliedAt = data.appliedAt ? new Date(data.appliedAt * 1000) : null;
  if (data.notes !== undefined) updateValues.notes = data.notes;
  if (data.jobDescription !== undefined) updateValues.jobDescription = data.jobDescription;
  if (data.metadata !== undefined) updateValues.metadata = data.metadata;

  await db
    .update(applications)
    .set(updateValues)
    .where(and(eq(applications.id, id), eq(applications.userId, session.userId)));

  const [updated] = await db
    .select()
    .from(applications)
    .where(and(eq(applications.id, id), eq(applications.userId, session.userId)));

  if (!updated) {
    throw new HttpError(500, 'DB_ERROR', 'Failed to retrieve updated application');
  }

  const eventNow = new Date();

  // Record status change event when the status field actually changed
  if (data.status !== undefined && data.status !== existing.status) {
    await db.insert(events).values({
      id: crypto.randomUUID(),
      applicationId: id,
      type: 'status_change',
      payload: JSON.stringify({ from: existing.status, to: data.status }),
      createdAt: eventNow,
    });
  }

  // Record note_added event when the notes field is updated
  if (data.notes !== undefined && data.notes !== existing.notes) {
    await db.insert(events).values({
      id: crypto.randomUUID(),
      applicationId: id,
      type: 'note_added',
      payload: JSON.stringify({ preview: (data.notes ?? '').slice(0, 80) }),
      createdAt: eventNow,
    });
  }

  return c.json({ application: updated });
});

// DELETE /:id — delete
router.delete('/:id', async (c) => {
  const session = requireSession(c);
  const { id } = c.req.param();
  const db = createDb(c.env.DB);

  const [existing] = await db
    .select()
    .from(applications)
    .where(and(eq(applications.id, id), eq(applications.userId, session.userId)));

  if (!existing) {
    throw new HttpError(404, 'NOT_FOUND', 'Application not found');
  }

  await db
    .delete(applications)
    .where(and(eq(applications.id, id), eq(applications.userId, session.userId)));

  return new Response(null, { status: 204 });
});

export default router;
