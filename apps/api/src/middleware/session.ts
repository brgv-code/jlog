import { createDb } from '@jlog/db';
import { sessions } from '@jlog/db';
import { and, eq } from 'drizzle-orm';
import { getCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import type { Env, Variables } from '../index';
import { verify } from '../lib/crypto';

export const sessionMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: Variables;
}>(async (c, next) => {
  // Check Authorization: Bearer <token> header first (extension auth)
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const db = createDb(c.env.DB);
    // Require type: 'extension' too, not just a matching id — keeps a cookie
    // session id from being usable as a bearer token, and vice versa.
    const rows = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, token), eq(sessions.type, 'extension')));
    const extSession = rows[0];

    if (extSession) {
      if (extSession.expiresAt < new Date()) {
        await db.delete(sessions).where(eq(sessions.id, token));
        c.set('session', null);
      } else {
        c.set('session', { userId: extSession.userId, sessionId: extSession.id });
      }
    } else {
      c.set('session', null);
    }

    await next();
    return;
  }

  // Fall back to cookie-based session
  const cookie = getCookie(c, 'jlog_session');

  if (!cookie) {
    c.set('session', null);
    await next();
    return;
  }

  const sessionId = await verify(cookie, c.env.SESSION_SECRET);

  if (!sessionId) {
    c.set('session', null);
    await next();
    return;
  }

  const db = createDb(c.env.DB);
  const rows = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  const session = rows[0];

  if (!session) {
    c.set('session', null);
    await next();
    return;
  }

  // Delete expired sessions and treat them as unauthenticated
  if (session.expiresAt < new Date()) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    c.set('session', null);
    await next();
    return;
  }

  c.set('session', { userId: session.userId, sessionId: session.id });
  await next();
});
