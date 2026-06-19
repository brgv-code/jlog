import { createDb } from '@jlog/db';
import { applications } from '@jlog/db';
import { HttpError } from '@jlog/shared';
import { and, eq, gte, isNotNull } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Env, Variables } from '../index';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

router.get('/', async (c) => {
  const session = c.var.session;
  if (!session) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Not authenticated');
  }

  const db = createDb(c.env.DB);
  const userId = session.userId;

  const allApps = await db.select().from(applications).where(eq(applications.userId, userId));

  const total = allApps.length;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const thisWeek = allApps.filter((a) => new Date(a.createdAt) >= sevenDaysAgo).length;

  const interviewingOrOffer = allApps.filter(
    (a) => a.status === 'interviewing' || a.status === 'offer',
  ).length;
  const interviewRate = total > 0 ? Math.round((interviewingOrOffer / total) * 100 * 10) / 10 : 0;

  const offers = allApps.filter((a) => a.status === 'offer').length;

  // Avg days from appliedAt → responseReceivedAt (only where both exist)
  const withResponse = allApps.filter((a) => a.appliedAt != null && a.responseReceivedAt != null);
  let avgDaysToResponse: number | null = null;
  if (withResponse.length > 0) {
    const totalDays = withResponse.reduce((sum, a) => {
      const applied = new Date(a.appliedAt!).getTime();
      const responded = new Date(a.responseReceivedAt!).getTime();
      return sum + (responded - applied) / (1000 * 60 * 60 * 24);
    }, 0);
    avgDaysToResponse = Math.round((totalDays / withResponse.length) * 10) / 10;
  }

  // Ghosted = stuck in 'applied' for >14 days
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const ghosted = allApps.filter(
    (a) => a.status === 'applied' && a.appliedAt != null && new Date(a.appliedAt) < fourteenDaysAgo,
  ).length;

  // Source breakdown
  const sourceBreakdown: Record<string, number> = {};
  for (const a of allApps) {
    const site = a.sourceSite ?? 'manual';
    sourceBreakdown[site] = (sourceBreakdown[site] ?? 0) + 1;
  }

  // Response rate (got any response vs total applied or beyond)
  const everApplied = allApps.filter(
    (a) => a.status !== 'saved',
  ).length;
  const gotResponse = allApps.filter(
    (a) => a.status === 'interviewing' || a.status === 'offer' || a.status === 'rejected',
  ).length;
  const responseRate =
    everApplied > 0 ? Math.round((gotResponse / everApplied) * 100 * 10) / 10 : 0;

  return c.json({
    total,
    thisWeek,
    interviewRate,
    offers,
    avgDaysToResponse,
    ghosted,
    responseRate,
    sourceBreakdown,
  });
});

export default router;
