import { createProRouter } from '@jlog/pro';
import { HttpError } from '@jlog/shared';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Auth } from './lib/auth';
import { runScheduledCleanup } from './lib/cleanup';
import { warmDemoLogos } from './lib/demo/seed';
import { isTrustedExtensionOrigin } from './lib/extensionIds';
import type { Tracing } from './lib/langfuse';
import { makeDrafter, makeTailor, startTrace } from './lib/tailor';
import { analyticsMiddleware } from './middleware/analytics';
import { authInstanceMiddleware } from './middleware/authInstance';
import { sessionMiddleware } from './middleware/session';
import { tracingMiddleware } from './middleware/tracing';
import applicationsRouter from './routes/applications';
import attributionRouter from './routes/attribution';
import authRouter from './routes/auth';
import billingRouter from './routes/billing';
import companyLogoRouter from './routes/companyLogo';
import eventsRouter from './routes/events';
import extensionRouter from './routes/extension';
import feedbackRouter from './routes/feedback';
import llmRouter, { extractRouter } from './routes/llm';
import profileRouter from './routes/profile';
import settingsRouter from './routes/settings';
import statsRouter from './routes/stats';

export interface Env {
  DB: D1Database;
  CV_FILES?: R2Bucket;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  SESSION_SECRET: string;
  BETTER_AUTH_SECRET?: string;
  API_ORIGIN?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  APPLE_CLIENT_ID?: string;
  APPLE_TEAM_ID?: string;
  APPLE_KEY_ID?: string;
  APPLE_PRIVATE_KEY?: string;
  APPLE_BUNDLE_ID?: string;
  RESEND_API_KEY?: string;
  ALLOWED_EMAILS?: string;
  OPEN_SIGNUP?: string;
  EMAIL_FROM?: string;
  ENCRYPTION_SECRET: string;
  WEB_ORIGIN: string;
  COOKIE_DOMAIN: string;
  EXTENSION_ID: string;
  CF_ACCESS_CLIENT_ID?: string;
  CF_ACCESS_CLIENT_SECRET?: string;
  CF_ACCESS_HOST?: string;
  LANGFUSE_PUBLIC_KEY?: string;
  LANGFUSE_SECRET_KEY?: string;
  LANGFUSE_BASE_URL?: string;
  LANGFUSE_TRACING_ENVIRONMENT?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_ID?: string;
  PAID_PLANS?: string;
  DEMO_ENABLED?: string;
  POSTHOG_KEY?: string;
  POSTHOG_HOST?: string;
}

export type Variables = {
  auth: Auth;
  session: {
    userId: string;
    sessionId: string;
    type: 'cookie' | 'extension';
    expiresAt: Date;
    label: string | null;
  } | null;
  expiredSession: { expiresAt: Date; label: string | null } | null;
  tracing: Tracing | null;
};
const app = new Hono<{ Bindings: Env; Variables: Variables }>();
app.use(
  '*',
  cors({
    origin: (origin, c) => {
      if (origin === c.env.WEB_ORIGIN) return origin;

      if (isTrustedExtensionOrigin(c.env.EXTENSION_ID, origin)) return origin;
      return null;
    },
    credentials: true,
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: [
      'Content-Type',
      'Authorization',
      'X-POSTHOG-DISTINCT-ID',
      'X-POSTHOG-SESSION-ID',
      'X-POSTHOG-WINDOW-ID',
    ],
  }),
);
app.use('*', authInstanceMiddleware);
app.use('*', sessionMiddleware);
app.use('*', tracingMiddleware);
app.use('/api/*', analyticsMiddleware);
app.route('/api/auth', authRouter);

app.post('/api/auth/demo/sign-in', async (c) => {
  const res = await c.var.auth.handler(c.req.raw);
  if (res.ok) c.executionCtx.waitUntil(warmDemoLogos(c.env).catch(() => {}));
  return res;
});
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
app.route('/api/feedback', feedbackRouter);
app.route('/api/attribution', attributionRouter);
app.route('/api/billing', billingRouter);
app.route('/api/pro', createProRouter({ makeTailor, makeDrafter, startTrace }));

app.get('/api/health', (c) => c.json({ ok: true, service: 'jlog-api' }));

app.onError((err, c) => {
  if (err instanceof HttpError) {
    return c.json(
      { error: { code: err.code, message: err.message } },
      err.statusCode as Parameters<typeof c.json>[1],
    );
  }

  console.error(err);
  return c.json(
    { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
    500,
  );
});

export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => app.fetch(request, env, ctx),

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      runScheduledCleanup(env)
        .then((swept) => {
          console.log(
            `[cleanup] removed ${swept.verifications} sign-in links, ` +
              `${swept.sessions} expired sessions, ${swept.extensionKeys} extension keys, ` +
              `${swept.demoAccounts} demo accounts, ${swept.uninstallFeedback} uninstall responses`,
          );
        })
        .catch((err) => console.error('[cleanup] scheduled sweep failed', err)),
    );
  },
};
