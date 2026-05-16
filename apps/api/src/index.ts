import { HttpError } from '@jlog/shared';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { sessionMiddleware } from './middleware/session';
import authRouter from './routes/auth';

export interface Env {
  DB: D1Database;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  SESSION_SECRET: string;
  WEB_ORIGIN: string;
  COOKIE_DOMAIN: string;
}

export type Variables = {
  session: { userId: string; sessionId: string } | null;
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use(
  '*',
  cors({
    origin: (origin, c) => (origin === c.env.WEB_ORIGIN ? origin : null),
    credentials: true,
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  }),
);
app.use('*', sessionMiddleware);
app.route('/api/auth', authRouter);

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
