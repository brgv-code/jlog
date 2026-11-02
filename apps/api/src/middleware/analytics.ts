import { createMiddleware } from 'hono/factory';
import type { Env, Variables } from '../index';
import { accountConsents, captureEvent, eventFor } from '../lib/analytics';

// One table in lib/analytics.ts instead of a call in every route; waitUntil keeps it off the response path.
export const analyticsMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: Variables;
}>(async (c, next) => {
  await next();

  const session = c.var.session;
  if (!c.env.POSTHOG_KEY || !session || c.res.status >= 400) return;

  const matched = eventFor(c.req.method, c.req.path);
  if (!matched) return;

  c.executionCtx.waitUntil(
    captureEvent(c.env, {
      userId: session.userId,
      event: matched.event,
      properties: {
        ...matched.properties,
        via: session.type === 'extension' ? 'extension' : 'web',
      },
      sessionId: c.req.header('X-POSTHOG-SESSION-ID') ?? null,
      hasConsent: accountConsents(c.env.DB),
    }),
  );
});
