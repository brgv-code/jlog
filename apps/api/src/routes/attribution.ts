import { createDb, signupAttribution, users } from '@jlog/db';
import {
  HttpError,
  channelFor,
  firstTouchSchema,
  heardFromSchema,
  normaliseHost,
} from '@jlog/shared';
import { eq, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { isDemoEmail } from '../lib/demo/account';
import { requireSession } from '../lib/session';

/**
 * Where an account came from (growth experiment E01).
 *
 * Better Auth creates the user inside an OAuth callback on this worker's
 * origin, where the browser's memory of its first visit is out of reach. So the
 * web app sends that memory itself, once, from the first signed-in page, and
 * the answer to "How did you find jlog?" arrives separately from the setup
 * guide. Either can come first.
 */
const router = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * How long after sign-up a first touch is still accepted. The browser sends it
 * from the first signed-in page, so a day is generous. The limit is what stops
 * an account from before this existed being stamped with whatever its browser
 * happens to remember today.
 */
export const FIRST_TOUCH_WINDOW_MS = 24 * 60 * 60 * 1000;

// GET / — whether the setup guide still needs to ask.
router.get('/', async (c) => {
  const session = requireSession(c);
  const db = createDb(c.env.DB);

  const [row] = await db
    .select({ heardFrom: signupAttribution.heardFrom })
    .from(signupAttribution)
    .where(eq(signupAttribution.userId, session.userId));

  return c.json({ heardFrom: row?.heardFrom ?? null });
});

// POST /first-touch — the browser's first visit, sent once after sign-up.
router.post('/first-touch', async (c) => {
  const session = requireSession(c);
  const body = await c.req.json().catch(() => {
    throw new HttpError(400, 'INVALID_JSON', 'Request body must be valid JSON');
  });

  const parsed = firstTouchSchema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(400, 'VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid body');
  }

  const db = createDb(c.env.DB);
  const [user] = await db
    .select({ email: users.email, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, session.userId));
  if (!user) throw new HttpError(401, 'UNAUTHORIZED', 'Not authenticated');

  // "Not recorded" rather than an error: the browser has nothing better to
  // send later, so it should stop trying. Demo accounts are swept overnight,
  // and crediting a channel with one would count a sign-up that never was.
  const now = new Date();
  if (isDemoEmail(user.email) || now.getTime() - user.createdAt.getTime() > FIRST_TOUCH_WINDOW_MS) {
    return c.json({ recorded: false });
  }

  const t = parsed.data;
  const referrerHost = normaliseHost(t.referrerHost);
  const touch = {
    channel: channelFor({ referrerHost, utmSource: t.utmSource, utmMedium: t.utmMedium }),
    referrerHost,
    utmSource: t.utmSource || null,
    utmMedium: t.utmMedium || null,
    utmCampaign: t.utmCampaign || null,
    landingPath: t.landingPath || null,
    // The browser's clock. Kept only if it is not in the future.
    firstSeenAt: t.firstSeenAt && t.firstSeenAt <= now.getTime() ? new Date(t.firstSeenAt) : null,
    updatedAt: now,
  };

  // The answer may already be in the row if the setup guide got there first.
  // Fill in the touch beside it, and never replace a touch already recorded.
  await db
    .insert(signupAttribution)
    .values({ userId: session.userId, ...touch, createdAt: now })
    .onConflictDoUpdate({
      target: signupAttribution.userId,
      set: touch,
      setWhere: isNull(signupAttribution.channel),
    });

  return c.json({ recorded: true });
});

// PUT /answer — "How did you find jlog?" from the setup guide. Can be changed.
router.put('/answer', async (c) => {
  const session = requireSession(c);
  const body = await c.req.json().catch(() => {
    throw new HttpError(400, 'INVALID_JSON', 'Request body must be valid JSON');
  });

  const parsed = heardFromSchema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(400, 'VALIDATION_ERROR', parsed.error.errors[0]?.message ?? 'Invalid body');
  }

  const now = new Date();
  const answer = {
    heardFrom: parsed.data.heardFrom,
    heardFromDetail: parsed.data.detail || null,
    updatedAt: now,
  };

  const db = createDb(c.env.DB);
  await db
    .insert(signupAttribution)
    .values({ userId: session.userId, ...answer, createdAt: now })
    .onConflictDoUpdate({ target: signupAttribution.userId, set: answer });

  return c.json({ heardFrom: answer.heardFrom });
});

export default router;
