import { Hono } from 'hono';

export interface Env {
  DB: D1Database;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  SESSION_SECRET: string;
  WEB_ORIGIN: string;
  COOKIE_DOMAIN: string;
}

const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', (c) => c.json({ ok: true, service: 'jlog-api' }));

export default app;
