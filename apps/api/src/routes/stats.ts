import { createDb } from '@jlog/db';
import { applications } from '@jlog/db';
import { APPLICATION_STATUSES } from '@jlog/shared';
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

/**
 * Everything the home page needs, in one round trip.
 *
 * Deliberately separate from `/api/stats`: that endpoint answers "how is the
 * search going" in scalars, this one answers "what should I do today" plus the
 * series behind it. Keeping them apart means the applications page does not pay
 * for six months of weekly buckets it never renders.
 */
router.get('/overview', async (c) => {
  const session = requireSession(c);
  const db = createDb(c.env.DB);
  const userId = session.userId;
  const mine = eq(applications.userId, userId);

  const now = Date.now();
  const fourteenDaysAgo = new Date(now - 14 * 24 * 60 * 60 * 1000);
  // 26 weeks reads as "this search" without turning into a year of mostly-zero
  // columns for someone who started last month.
  const WEEKS = 26;
  const windowStart = new Date(now - WEEKS * 7 * 24 * 60 * 60 * 1000);

  const [attentionRows, funnelRows, sourceRows, weekRows, responseRows] = await Promise.all([
    db
      .select({
        // Applied, and long enough ago that silence is now an answer.
        ghosted: sql<number>`sum(case when ${and(eq(applications.status, 'applied'), isNotNull(applications.appliedAt), lt(applications.appliedAt, fourteenDaysAgo))} then 1 else 0 end)`,
        // Applied recently enough that silence is still normal.
        awaiting: sql<number>`sum(case when ${and(eq(applications.status, 'applied'), isNotNull(applications.appliedAt), gte(applications.appliedAt, fourteenDaysAgo))} then 1 else 0 end)`,
        interviewing: sql<number>`sum(case when ${eq(applications.status, 'interviewing')} then 1 else 0 end)`,
      })
      .from(applications)
      .where(mine),
    db
      .select({ status: applications.status, count: sql<number>`count(*)` })
      .from(applications)
      .where(mine)
      .groupBy(applications.status),
    db
      .select({
        source: sql<string>`coalesce(${applications.sourceSite}, 'manual')`,
        count: sql<number>`count(*)`,
      })
      .from(applications)
      .where(mine)
      .groupBy(sql`coalesce(${applications.sourceSite}, 'manual')`),
    db
      .select({
        // 'unixepoch' is required — these columns hold raw unix seconds, and the
        // date functions silently return NULL without it.
        week: sql<string>`strftime('%Y-%W', ${applications.createdAt}, 'unixepoch')`,
        count: sql<number>`count(*)`,
      })
      .from(applications)
      .where(and(mine, gte(applications.createdAt, windowStart)))
      .groupBy(sql`strftime('%Y-%W', ${applications.createdAt}, 'unixepoch')`),
    db
      .select({
        days: sql<number>`julianday(${applications.responseReceivedAt}, 'unixepoch') - julianday(${applications.appliedAt}, 'unixepoch')`,
      })
      .from(applications)
      .where(
        and(mine, isNotNull(applications.appliedAt), isNotNull(applications.responseReceivedAt)),
      ),
  ]);

  const attention = attentionRows[0];

  // Every status is present whether or not it has rows: a funnel with stages
  // missing is a funnel that lies about the shape of the pipeline.
  const funnelCounts = new Map(funnelRows.map((r) => [r.status, r.count]));
  const funnel = APPLICATION_STATUSES.map((status) => ({
    status,
    count: funnelCounts.get(status) ?? 0,
  }));

  // Same reason, on the time axis: gaps have to be zeroes, or a fortnight of
  // nothing renders as a straight line between the weeks either side of it.
  const weekCounts = new Map(weekRows.map((r) => [r.week, r.count]));
  const overTime: { week: string; count: number }[] = [];
  for (let i = WEEKS - 1; i >= 0; i--) {
    const d = new Date(now - i * 7 * 24 * 60 * 60 * 1000);
    const key = isoWeekKey(d);
    overTime.push({ week: key, count: weekCounts.get(key) ?? 0 });
  }

  const days = responseRows
    .map((r) => r.days)
    .filter((d): d is number => d != null && Number.isFinite(d))
    .sort((a, b) => a - b);

  return c.json({
    attention: {
      ghosted: attention?.ghosted ?? 0,
      awaiting: attention?.awaiting ?? 0,
      interviewing: attention?.interviewing ?? 0,
    },
    funnel,
    sources: sourceRows.sort((a, b) => b.count - a.count),
    overTime,
    responseTime: {
      medianDays: median(days),
      // Fixed buckets rather than computed ones: a histogram whose bins move
      // with the data cannot be compared against the same chart a month later.
      buckets: [
        { label: '0-3d', count: days.filter((d) => d < 3).length },
        { label: '3-7d', count: days.filter((d) => d >= 3 && d < 7).length },
        { label: '1-2w', count: days.filter((d) => d >= 7 && d < 14).length },
        { label: '2-4w', count: days.filter((d) => d >= 14 && d < 28).length },
        { label: '4w+', count: days.filter((d) => d >= 28).length },
      ],
    },
  });
});

/** Matches SQLite's strftime('%Y-%W') so generated keys line up with grouped ones. */
function isoWeekKey(d: Date): string {
  const year = d.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const dayOfYear = Math.floor((Date.UTC(year, d.getUTCMonth(), d.getUTCDate()) - jan1) / 86400000);
  const week = Math.floor((dayOfYear + new Date(jan1).getUTCDay()) / 7);
  return `${year}-${String(week).padStart(2, '0')}`;
}

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  const hi = sorted[mid] ?? 0;
  const lo = sorted[mid - 1] ?? hi;
  const value = sorted.length % 2 === 0 ? (lo + hi) / 2 : hi;
  return Math.round(value * 10) / 10;
}

export default router;
