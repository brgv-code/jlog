import { createMiddleware } from 'hono/factory';
import type { Env, Variables } from '../index';
import { getTracing } from '../lib/langfuse';

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
    c.executionCtx.waitUntil(tracing.finish());
  }
});
