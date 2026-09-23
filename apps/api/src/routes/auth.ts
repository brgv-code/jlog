import { createDb, users } from '@jlog/db';
import { HttpError } from '@jlog/shared';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { availableProviders } from '../lib/auth';

/**
 * The two auth endpoints Better Auth does not provide.
 *
 * Everything else under `/api/auth` — starting a social sign-in, the provider
 * callbacks, magic links, sign-out — is handled by Better Auth's own handler.
 * This router is mounted *before* it in `index.ts`, so these two exact paths
 * win and the rest falls through to the library.
 */
const router = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * Which sign-in methods this instance offers, so the login page can show the
 * buttons that work and no others. Unauthenticated by design — it reveals only
 * which providers are configured, which is visible from the login page anyway.
 */
router.get('/providers', (c) => c.json({ providers: availableProviders(c.env) }));

/**
 * The signed-in user, in jlog's own shape.
 *
 * Better Auth's `/api/auth/get-session` returns the session and a user, but not
 * the billing fields the settings page needs, and four components already read
 * this endpoint. Keeping it is cheaper than changing all of them and gives the
 * billing shape one place to live.
 */
router.get('/me', async (c) => {
  const session = c.var.session;

  if (!session) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Not authenticated');
  }

  const db = createDb(c.env.DB);
  const [user] = await db.select().from(users).where(eq(users.id, session.userId));

  if (!user) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Not authenticated');
  }

  return c.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl ?? null,
      plan: user.plan,
      // Enough for the settings page to tell a subscription apart from a
      // comped account, and to say when the former renews. `planSource` is
      // what stops the UI offering a billing portal to someone who has never
      // been billed (ADR-011).
      planSource: user.planSource ?? null,
      planStatus: user.planStatus ?? null,
      currentPeriodEnd: user.currentPeriodEnd ? user.currentPeriodEnd.toISOString() : null,
    },
  });
});

export default router;
