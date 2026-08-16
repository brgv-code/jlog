import { createProRouter } from '@jlog/pro';
import { HttpError } from '@jlog/shared';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { sessionMiddleware } from './middleware/session';
import applicationsRouter from './routes/applications';
import authRouter from './routes/auth';
import eventsRouter from './routes/events';
import extensionRouter from './routes/extension';
import llmRouter, { extractRouter } from './routes/llm';
import settingsRouter from './routes/settings';
import statsRouter from './routes/stats';

export interface Env {
  DB: D1Database;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  SESSION_SECRET: string;
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
}

export type Variables = {
  // what is sessionID?
  session: { userId: string; sessionId: string } | null;
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
app.use('*', sessionMiddleware);
app.route('/api/auth', authRouter);
app.route('/api/applications', applicationsRouter);
app.route('/api/applications', eventsRouter);
app.route('/api/stats', statsRouter);
app.route('/api/settings', settingsRouter);
app.route('/api/llm', llmRouter);
app.route('/api/extract', extractRouter);
app.route('/api/extension', extensionRouter);
// Paid feature surface. In the OSS build this is the @jlog/pro stub (every route
// returns 402); the hosted build aliases @jlog/pro to the private implementation.
app.route('/api/pro', createProRouter());

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

export default app;
