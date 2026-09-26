import { createDb, extensionKeys } from '@jlog/db';
import { eq } from 'drizzle-orm';
import { createMiddleware } from 'hono/factory';
import type { Env, Variables } from '../index';

/**
 * Works out who is calling, for every route in the app.
 *
 * Two kinds of caller, kept deliberately separate:
 *
 *   - The **extension**, presenting a long-lived key in an `Authorization`
 *     header. Its keys live in their own table with their own lifetime, label
 *     and revoke list.
 *   - A **browser**, presenting a session cookie, which Better Auth owns
 *     entirely. The cookie is signed and rotated by rules inside the library,
 *     so the only correct way to read it is to ask the library.
 *
 * Before, both lived in one table and a `type` column had to stop an extension
 * key being replayed as a cookie session. Separate tables make that question
 * unaskable rather than merely answered — but `type` stays on the resolved
 * session, because routes still care which channel they are being called over.
 */
export const sessionMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: Variables;
}>(async (c, next) => {
  c.set('expiredSession', null);

  const authHeader = c.req.header('Authorization');

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const db = createDb(c.env.DB);
    const [key] = await db.select().from(extensionKeys).where(eq(extensionKeys.id, token));

    if (!key) {
      c.set('session', null);
    } else if (key.expiresAt < new Date()) {
      // Deliberately left in the table rather than deleted here. The popup asks
      // /api/extension/session why it is locked out, and "this key expired on
      // Tuesday" is a far better answer than "unknown key" — which is all that
      // is left once the row is gone. Expired rows are pruned on the
      // cookie-authenticated key-list and key-create paths instead.
      c.set('expiredSession', { expiresAt: key.expiresAt, label: key.label });
      c.set('session', null);
    } else {
      c.set('session', {
        userId: key.userId,
        sessionId: key.id,
        type: 'extension',
        expiresAt: key.expiresAt,
        label: key.label,
      });
    }

    await next();
    return;
  }

  // Browser session. Better Auth reads its cookie off the raw request itself,
  // which is why the headers are handed over whole rather than picked apart.
  const result = await c.var.auth.api.getSession({ headers: c.req.raw.headers });

  c.set(
    'session',
    result?.session
      ? {
          userId: result.session.userId,
          sessionId: result.session.id,
          type: 'cookie',
          expiresAt: new Date(result.session.expiresAt),
          // Labels belong to extension keys; a browser session never has one.
          label: null,
        }
      : null,
  );

  await next();
});
