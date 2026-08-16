import { events, applications, createDb } from '@jlog/db';
import {
  HttpError,
  createApplicationSchema,
  paginationSchema,
  updateApplicationSchema,
} from '@jlog/shared';
import type { BatchItem } from 'drizzle-orm/batch';
import { and, desc, eq, like, lt, or } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { requireSession } from '../lib/session';

type BatchStatement = BatchItem<'sqlite'>;

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

// Cursor encodes the value of whichever column is being sorted on, plus the row id
// as a tiebreaker — a plain id cursor only works for the default sort (createdAt).
function encodeCursor(sortValue: string, id: string): string {
  return btoa(JSON.stringify({ v: sortValue, id }));
}

function decodeCursor(cursor: string): { v: string; id: string } | null {
  try {
    const parsed = JSON.parse(atob(cursor));
    if (typeof parsed.v !== 'string' || typeof parsed.id !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * The first time an application's status leaves 'applied' (excluding a move back to
 * 'saved'), and nothing has explicitly set responseReceivedAt already, stamp it now.
 * Named and pure so the rule is testable without a Hono context.
 */
export function deriveResponseReceivedAt(
  existing: { status: string; responseReceivedAt: Date | null },
  patch: { status: string | undefined; responseReceivedAt: Date | null | undefined },
): Date | undefined {
  const statusLeftApplied =
    patch.status !== undefined &&
    existing.status === 'applied' &&
    patch.status !== 'applied' &&
    patch.status !== 'saved';

  if (statusLeftApplied && existing.responseReceivedAt == null && patch.responseReceivedAt == null) {
    return new Date();
  }

  return undefined;
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

  const sortCol =
    sort === 'appliedAt'
      ? applications.appliedAt
      : sort === 'company'
        ? applications.company
        : applications.createdAt;

  // Keyset pagination on (sortCol, id) so the cursor stays valid for every
  // sort option, not just the default (createdAt).
  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (!decoded) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid cursor');
    }
    const cursorValue = sort === 'company' ? decoded.v : new Date(decoded.v);
    conditions.push(
      or(lt(sortCol, cursorValue), and(eq(sortCol, cursorValue), lt(applications.id, decoded.id)))!,
    );
  }

  const rows = await db
    .select()
    .from(applications)
    .where(and(...conditions))
    .orderBy(desc(sortCol), desc(applications.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const lastItem = items[items.length - 1];
  const nextCursor =
    hasMore && lastItem
      ? encodeCursor(
          sort === 'company'
            ? lastItem.company
            : (sort === 'appliedAt' ? lastItem.appliedAt : lastItem.createdAt)?.toISOString() ?? '',
          lastItem.id,
        )
      : null;

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

  // Insert + event both run in one D1 batch, so a failure on either statement
  // leaves neither applied — no application can end up missing its 'created' event.
  const [[application]] = await db.batch([
    db
      .insert(applications)
      .values({
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
        salaryMin: data.salaryMin ?? null,
        salaryMax: data.salaryMax ?? null,
        salaryCurrency: data.salaryCurrency ?? 'USD',
        responseReceivedAt: data.responseReceivedAt
          ? new Date(data.responseReceivedAt * 1000)
          : null,
        metadata: data.metadata ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning(),
    db.insert(events).values({
      id: crypto.randomUUID(),
      applicationId: id,
      type: 'created',
      payload: JSON.stringify({ company: data.company, role: data.role }),
      createdAt: now,
    }),
  ]);

  if (!application) {
    throw new HttpError(500, 'DB_ERROR', 'Failed to create application');
  }

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
  if (data.salaryMin !== undefined) updateValues.salaryMin = data.salaryMin;
  if (data.salaryMax !== undefined) updateValues.salaryMax = data.salaryMax;
  if (data.salaryCurrency !== undefined) updateValues.salaryCurrency = data.salaryCurrency;
  if (data.responseReceivedAt !== undefined)
    updateValues.responseReceivedAt = data.responseReceivedAt
      ? new Date(data.responseReceivedAt * 1000)
      : null;
  if (data.metadata !== undefined) updateValues.metadata = data.metadata;

  const derivedResponseReceivedAt = deriveResponseReceivedAt(existing, {
    status: data.status,
    responseReceivedAt: updateValues.responseReceivedAt,
  });
  if (derivedResponseReceivedAt !== undefined) {
    updateValues.responseReceivedAt = derivedResponseReceivedAt;
  }

  const eventNow = new Date();

  // Build the update plus whichever event inserts actually apply, and run them
  // as one D1 batch — the update never lands without its event log entries.
  const statements: [BatchStatement, ...BatchStatement[]] = [
    db
      .update(applications)
      .set(updateValues)
      .where(and(eq(applications.id, id), eq(applications.userId, session.userId)))
      .returning(),
  ];

  if (data.status !== undefined && data.status !== existing.status) {
    statements.push(
      db.insert(events).values({
        id: crypto.randomUUID(),
        applicationId: id,
        type: 'status_change',
        payload: JSON.stringify({ from: existing.status, to: data.status }),
        createdAt: eventNow,
      }),
    );
  }

  if (data.notes !== undefined && data.notes !== existing.notes) {
    statements.push(
      db.insert(events).values({
        id: crypto.randomUUID(),
        applicationId: id,
        type: 'note_added',
        payload: JSON.stringify({ preview: (data.notes ?? '').slice(0, 80) }),
        createdAt: eventNow,
      }),
    );
  }

  const [[updated]] = await db.batch(statements);

  if (!updated) {
    throw new HttpError(500, 'DB_ERROR', 'Failed to update application');
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
