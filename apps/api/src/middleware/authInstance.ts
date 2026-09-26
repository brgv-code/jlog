import { createMiddleware } from 'hono/factory';
import type { Env, Variables } from '../index';
import { getAuth } from '../lib/auth';

/**
 * Builds this request's Better Auth instance and puts it on the context.
 *
 * It has to be per request: workerd hands the D1 binding and every credential in
 * through `env` on each invocation, so there is no module-level moment at which
 * they are known. But it should only happen *once* per request — the session
 * middleware needs the instance to read the cookie, and the `/api/auth/*`
 * handler needs it to serve the endpoint, and constructing one is not free.
 */
export const authInstanceMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: Variables;
}>(async (c, next) => {
  c.set('auth', await getAuth(c.env, c.req.url));
  await next();
});
