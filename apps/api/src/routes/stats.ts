import { createDb } from '@jlog/db';
import { applications } from '@jlog/db';
import { and, eq, gte, inArray, isNotNull, lt, not, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { requireSession } from '../lib/session';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

router.get('/', async (c) => {
  const session = requireSession(c);
  const db = createDb(c.env.DB);
  const userId = session.userId;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  // One aggregate query for the scalar stats, one grouped query for the source
  // breakdown — SQL does the counting instead of pulling every row into the
  // worker and running six passes over it in JS.
  const [[aggregate], sourceRows] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)`,
        thisWeek: sql<number>`sum(case when ${gte(applications.createdAt, sevenDaysAgo)} then 1 else 0 end)`,
        interviewingOrOffer: sql<number>`sum(case when ${inArray(applications.status, ['interviewing', 'offer'])} then 1 else 0 end)`,
        offers: sql<number>`sum(case when ${eq(applications.status, 'offer')} then 1 else 0 end)`,
        // 'unixepoch' is required: these columns store raw unix seconds, and
        // julianday() silently returns NULL if it isn't told how to parse that.
        avgDaysToResponse: sql<
          number | null
        >`avg(case when ${and(isNotNull(applications.appliedAt), isNotNull(applications.responseReceivedAt))} then (julianday(${applications.responseReceivedAt}, 'unixepoch') - julianday(${applications.appliedAt}, 'unixepoch')) end)`,
        ghosted: sql<number>`sum(case when ${and(eq(applications.status, 'applied'), isNotNull(applications.appliedAt), lt(applications.appliedAt, fourteenDaysAgo))} then 1 else 0 end)`,
        everApplied: sql<number>`sum(case when ${not(eq(applications.status, 'saved'))} then 1 else 0 end)`,
        gotResponse: sql<number>`sum(case when ${inArray(applications.status, ['interviewing', 'offer', 'rejected'])} then 1 else 0 end)`,
      })
      .from(applications)
      .where(eq(applications.userId, userId)),
    db
      .select({
        sourceSite: sql<string>`coalesce(${applications.sourceSite}, 'manual')`,
        count: sql<number>`count(*)`,
      })
      .from(applications)
      .where(eq(applications.userId, userId))
      .groupBy(sql`coalesce(${applications.sourceSite}, 'manual')`),
  ]);

  const total = aggregate?.total ?? 0;
  const interviewingOrOffer = aggregate?.interviewingOrOffer ?? 0;
  const everApplied = aggregate?.everApplied ?? 0;
  const gotResponse = aggregate?.gotResponse ?? 0;

  const sourceBreakdown: Record<string, number> = {};
  for (const row of sourceRows) {
    sourceBreakdown[row.sourceSite] = row.count;
  }

  return c.json({
    total,
    thisWeek: aggregate?.thisWeek ?? 0,
    interviewRate: total > 0 ? Math.round((interviewingOrOffer / total) * 1000) / 10 : 0,
    offers: aggregate?.offers ?? 0,
    avgDaysToResponse:
      aggregate?.avgDaysToResponse != null
        ? Math.round(aggregate.avgDaysToResponse * 10) / 10
        : null,
    ghosted: aggregate?.ghosted ?? 0,
    responseRate: everApplied > 0 ? Math.round((gotResponse / everApplied) * 1000) / 10 : 0,
    sourceBreakdown,
  });
});

export default router;
