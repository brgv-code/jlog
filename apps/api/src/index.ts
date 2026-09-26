import { createProRouter } from '@jlog/pro';
import { HttpError } from '@jlog/shared';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Auth } from './lib/auth';
import { runScheduledCleanup } from './lib/cleanup';
import type { Tracing } from './lib/langfuse';
import { makeDrafter, makeTailor } from './lib/tailor';
import { authInstanceMiddleware } from './middleware/authInstance';
import { sessionMiddleware } from './middleware/session';
import { tracingMiddleware } from './middleware/tracing';
import applicationsRouter from './routes/applications';
import authRouter from './routes/auth';
import billingRouter from './routes/billing';
import companyLogoRouter from './routes/companyLogo';
import eventsRouter from './routes/events';
import extensionRouter from './routes/extension';
import llmRouter, { extractRouter } from './routes/llm';
import profileRouter from './routes/profile';
import settingsRouter from './routes/settings';
import statsRouter from './routes/stats';

export interface Env {
  DB: D1Database;
  /**
   * The imported CV files. Only bytes live here — everything the app queries
   * about a CV is in D1, keyed by `cv_sources.pdf_key`. Optional so a
   * deployment without the binding degrades to the text view rather than
   * failing to boot.
   */
  CV_FILES?: R2Bucket;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  SESSION_SECRET: string;
  /**
   * Optional: Better Auth's own signing secret. Left unset it falls back to
   * SESSION_SECRET, so a deployment has one fewer thing to generate. Changing
   * either signs everyone out, which is the point of it.
   */
  BETTER_AUTH_SECRET?: string;
  /**
   * Optional: the origin this worker is reachable at. Normally derived from the
   * request, which is right for local, preview and production alike; set it
   * only when something in front rewrites the Host header.
   */
  API_ORIGIN?: string;
  /**
   * Optional: Sign in with Google. Unset means the provider is not registered
   * and the login page does not offer it.
   */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /**
   * Optional: Sign in with Apple. All four are required together — Apple issues
   * no client secret, so one is signed per exchange from the downloaded `.p8`
   * key (APPLE_PRIVATE_KEY) identified by APPLE_KEY_ID, on behalf of
   * APPLE_TEAM_ID. APPLE_CLIENT_ID is the Services ID, not the app's bundle id.
   *
   * Apple answers its callback with a cross-site form POST and refuses
   * localhost redirect URIs, so this provider cannot be exercised against a
   * plain http://localhost origin — it needs a real HTTPS deployment.
   */
  APPLE_CLIENT_ID?: string;
  APPLE_TEAM_ID?: string;
  APPLE_KEY_ID?: string;
  APPLE_PRIVATE_KEY?: string;
  /** Optional: only needed for a native iOS app signing in with an identity token. */
  APPLE_BUNDLE_ID?: string;
  /**
   * Optional: emailed sign-in links, sent through Resend. Both are required
   * together; unset means the login page does not offer email sign-in at all.
   * EMAIL_FROM must be on a domain verified in Resend.
   */
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  // Dedicated secret for encrypting stored LLM API keys — kept separate from
  // SESSION_SECRET so a change to one doesn't have blast radius on the other.
  ENCRYPTION_SECRET: string;
  WEB_ORIGIN: string;
  COOKIE_DOMAIN: string;
  // The jlog Chrome extension's ID — CORS only trusts this one, not any chrome-extension:// origin.
  EXTENSION_ID: string;
  // Optional: Cloudflare Access service token for protecting a tunnelled Ollama instance
  CF_ACCESS_CLIENT_ID?: string;
  CF_ACCESS_CLIENT_SECRET?: string;
  // Optional: Langfuse tracing for LLM extraction calls. Unset in an environment
  // (e.g. a contributor's local .dev.vars) means tracing is simply skipped.
  LANGFUSE_PUBLIC_KEY?: string;
  LANGFUSE_SECRET_KEY?: string;
  LANGFUSE_BASE_URL?: string;
  // Which Langfuse environment these traces belong to. Separates a preview
  // deployment's traces from production's inside one project.
  LANGFUSE_TRACING_ENVIRONMENT?: string;
  /**
   * Stripe, for the hosted instance's paid plan (ADR-011). All optional: a
   * self-hoster has no billing, and every billing route fails closed with
   * BILLING_NOT_CONFIGURED naming the missing one. Secrets rather than vars —
   * wrangler.toml is in the public repo.
   */
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_ID?: string;
}

export type Variables = {
  /**
   * This request's Better Auth instance.
   *
   * Built once by `authInstanceMiddleware` and shared, because constructing one
   * is not free and both the session middleware and the `/api/auth/*` handler
   * need it — without this, every sign-in request would build two.
   */
  auth: Auth;
  // what is sessionID?
  // `expiresAt`/`label` are carried here so the extension can ask when its key
  // dies without the route re-reading the row the middleware already fetched.
  session: {
    userId: string;
    sessionId: string;
    type: 'cookie' | 'extension';
    expiresAt: Date;
    label: string | null;
  } | null;
  /**
   * Set only when the caller presented an extension key that exists but has
   * run out. Lets /api/extension/session tell "expired" apart from "never seen
   * this key", which is the difference between a useful popup message and a
   * confusing one.
   */
  expiredSession: { expiresAt: Date; label: string | null } | null;
  // Null whenever Langfuse isn't configured, which is the normal state locally.
  tracing: Tracing | null;
};
// Hono wiring: CORS has to run before the session middleware and routes so a
// disallowed origin is rejected before we ever touch cookies or the DB; the
// error handler sits last so it can catch anything thrown further down the chain.
const app = new Hono<{ Bindings: Env; Variables: Variables }>();
app.use(
  '*',
  cors({
    origin: (origin, c) => {
      // Returning the origin string (vs. true) is what makes Hono echo it back in
      // Access-Control-Allow-Origin — required because credentials: true forbids "*".
      if (origin === c.env.WEB_ORIGIN) return origin;

      // Only jlog's own extension, pinned by ID — chrome-extension:// is a scheme,
      // not a domain, so matching the prefix alone would trust every extension
      // installed in the user's browser, not just this one.
      if (origin === `chrome-extension://${c.env.EXTENSION_ID}`) return origin;
      return null;
    },
    // Lets the browser attach/receive the session cookie on cross-origin requests.
    credentials: true,
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  }),
);
// Before anything that needs to know who is calling: build this request's auth
// instance once, so the session lookup and the /api/auth/* handler share it.
app.use('*', authInstanceMiddleware);
app.use('*', sessionMiddleware);
// After the session middleware: a trace is only worth correlating if it can
// carry the userId that middleware resolves.
app.use('*', tracingMiddleware);
// jlog's own two auth endpoints go on FIRST. Hono runs matching handlers in
// registration order, so /api/auth/providers and /api/auth/me are answered here
// and every other path under /api/auth falls through to Better Auth below.
app.route('/api/auth', authRouter);

// Better Auth owns the rest: starting a social sign-in, the provider callbacks,
// magic links, sign-out, session lookup. Its handler takes the raw Request and
// returns a Response, so it is mounted rather than wrapped.
app.on(['GET', 'POST'], '/api/auth/*', (c) => c.var.auth.handler(c.req.raw));
app.route('/api/applications', applicationsRouter);
app.route('/api/applications', eventsRouter);
app.route('/api/stats', statsRouter);
app.route('/api/company-logo', companyLogoRouter);
app.route('/api/settings', settingsRouter);
app.route('/api/profile', profileRouter);
app.route('/api/llm', llmRouter);
app.route('/api/extract', extractRouter);
app.route('/api/extension', extensionRouter);
// Billing. /billing/webhook is deliberately sessionless: Stripe sends no cookie
// and the signature is what authenticates it.
app.route('/api/billing', billingRouter);
// Paid feature surface. In the OSS build this is the @jlog/pro stub (every route
// returns 402); the hosted build aliases @jlog/pro to the private implementation.
app.route('/api/pro', createProRouter({ makeTailor, makeDrafter }));

app.get('/api/health', (c) => c.json({ ok: true, service: 'jlog-api' }));

// Central error handler — converts HttpError to the standard error shape
app.onError((err, c) => {
  if (err instanceof HttpError) {
    return c.json(
      { error: { code: err.code, message: err.message } },
      // Hono's json() accepts StatusCode; cast is safe because HttpError codes are valid HTTP statuses
      err.statusCode as Parameters<typeof c.json>[1],
    );
  }

  console.error(err);
  return c.json(
    { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
    500,
  );
});

/**
 * Two entry points now, not one.
 *
 * `fetch` is the app. `scheduled` is the nightly sweep of expired credentials
 * (see lib/cleanup.ts) — without it, an abandoned account's spent magic links
 * and dead extension keys sit in the database forever, because every other
 * cleanup path only runs when that same person comes back.
 *
 * `fetch` is wrapped rather than passed as `app.fetch` so it cannot be
 * separated from its own `this`.
 */
export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => app.fetch(request, env, ctx),

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      runScheduledCleanup(env)
        .then((swept) => {
          console.log(
            `[cleanup] removed ${swept.verifications} sign-in links, ` +
              `${swept.sessions} expired sessions, ${swept.extensionKeys} extension keys`,
          );
        })
        // A failed sweep is worth knowing about and is not worth retrying into:
        // the next run is tomorrow, and nothing downstream depends on it having
        // happened.
        .catch((err) => console.error('[cleanup] scheduled sweep failed', err)),
    );
  },
};
