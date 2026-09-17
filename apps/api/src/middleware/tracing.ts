import { createMiddleware } from 'hono/factory';
import type { Env, Variables } from '../index';
import { getTracing } from '../lib/langfuse';

/**
 * Owns the lifetime of a request's Langfuse observations.
 *
 * The routes that trace can't do this themselves: `makeJsonCaller` hands back a
 * closure that the caller keeps using after the function that built it has
 * returned, so the only frame that knows the work is over is this one.
 */
export const tracingMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: Variables;
}>(async (c, next) => {
  const tracing = getTracing(c.env);
  c.set('tracing', tracing);

  if (!tracing) {
    await next();
    return;
  }

  try {
    await next();
  } finally {
    // Workers tear down the isolate right after the response is sent, so
    // closing the observations and the export that follows both have to be
    // handed to waitUntil to actually complete.
    c.executionCtx.waitUntil(tracing.finish());
  }
});
