import { createDb } from '@jlog/db';
import { applications } from '@jlog/db';
import { HttpError } from '@jlog/shared';
import { and, eq, gte } from 'drizzle-orm';
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
  const thisWeekApps = await db
    .select()
    .from(applications)
    .where(and(eq(applications.userId, userId), gte(applications.createdAt, sevenDaysAgo)));

  const thisWeek = thisWeekApps.length;

  const interviewingOrOffer = allApps.filter(
    (a) => a.status === 'interviewing' || a.status === 'offer',
  ).length;

  const interviewRate = total > 0 ? Math.round((interviewingOrOffer / total) * 100 * 10) / 10 : 0;

  const offers = allApps.filter((a) => a.status === 'offer').length;

  return c.json({ total, thisWeek, interviewRate, offers });
});

export default router;
