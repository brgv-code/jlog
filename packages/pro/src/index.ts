import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';

/**
 * Pro-feature seam — PUBLIC STUB.
 *
 * This is the open-source stub of `@jlog/pro`. It keeps the public build
 * compiling and running with the paid document-generation feature visibly
 * *locked*. The real implementation lives in a private package and is aliased
 * over this one in the hosted build.
 *
 * Every consumer (`apps/api`, `apps/web`) imports only from `@jlog/pro`, so the
 * same source compiles in both the OSS and the hosted worlds — only the
 * implementation behind this interface differs.
 *
 * See the knowledge base: projects/jlog/docs/open-core-architecture.md (ADR-003).
 */

/** Whether the real pro implementation is present. Always false in the stub. */
export const isProEnabled = false as const;

/** Standard error body returned when a pro feature is hit without entitlement. */
export const PRO_REQUIRED_ERROR = {
  error: {
    code: 'PRO_REQUIRED',
    message: 'This feature requires a jlog Pro subscription.',
  },
} as const;

/** Upsell copy the web app renders in place of the locked feature. */
export const PRO_UPSELL = {
  title: 'Tailored documents are a Pro feature',
  body: 'Generate a job-specific CV and cover letter from your base templates, compiled to PDF — upgrade to jlog Pro to unlock.',
  cta: 'Upgrade to Pro',
} as const;

/**
 * Middleware guarding a pro-only route. In the stub it always short-circuits
 * with 402; the private impl replaces this with a real entitlement check
 * (subscription plan lookup) that calls `next()` for entitled users.
 */
export const requirePro = createMiddleware(async (c) => {
  return c.json(PRO_REQUIRED_ERROR, 402);
});

/**
 * Router mounted at `/api/pro`. In the stub every path returns 402, so the OSS
 * build exposes the pro surface as locked rather than missing. The private impl
 * provides the real routes (base-document CRUD, generate, compile).
 */
export function createProRouter(): Hono {
  const router = new Hono();
  router.all('*', (c) => c.json(PRO_REQUIRED_ERROR, 402));
  return router;
}
