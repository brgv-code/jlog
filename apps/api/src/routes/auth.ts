import { createDb, sessions, users } from '@jlog/db';
import { githubEmailSchema, githubUserSchema } from '@jlog/shared';
import { HttpError } from '@jlog/shared';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Env, Variables } from '../index';
import { generateId, sign } from '../lib/crypto';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

// 30 days in seconds
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
// 10 minutes in seconds
const OAUTH_STATE_TTL_SECONDS = 10 * 60;

router.get('/github/start', async (c) => {
  // Generate an opaque state value to prevent CSRF during OAuth
  const state = await generateId(16);
  const signedState = await sign(state, c.env.SESSION_SECRET);

  const isLocalhost = c.env.COOKIE_DOMAIN === 'localhost';
  setCookie(c, 'jlog_oauth_state', signedState, {
    httpOnly: true,
    secure: !isLocalhost,
    sameSite: 'Lax',
    // No domain attribute — scopes to the exact API host automatically.
    // workers.dev and pages.dev are on the public suffix list, so setting a
    // domain attribute causes browsers to silently reject the cookie.
    maxAge: OAUTH_STATE_TTL_SECONDS,
    path: '/',
  });

  const params = new URLSearchParams({
    client_id: c.env.GITHUB_CLIENT_ID,
    scope: 'read:user,user:email',
    state,
  });

  return c.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
});

router.get('/github/callback', async (c) => {
  const isLocalhost = c.env.COOKIE_DOMAIN === 'localhost';
  const { code, state } = c.req.query();

  if (!code || !state) {
    throw new HttpError(400, 'BAD_REQUEST', 'Missing code or state parameter');
  }

  // Validate the state param against the signed cookie
  const stateCookie = getCookie(c, 'jlog_oauth_state');
  if (!stateCookie) {
    throw new HttpError(400, 'BAD_REQUEST', 'Missing state cookie');
  }

  // The cookie stores the signed state; we reconstruct and compare
  const expectedSigned = await sign(state, c.env.SESSION_SECRET);
  if (stateCookie !== expectedSigned) {
    throw new HttpError(400, 'BAD_REQUEST', 'Invalid OAuth state');
  }

  deleteCookie(c, 'jlog_oauth_state', { path: '/' });

  // Exchange the code for a GitHub access token
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: c.env.GITHUB_CLIENT_ID,
      client_secret: c.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });

  if (!tokenRes.ok) {
    throw new HttpError(502, 'GITHUB_ERROR', 'Failed to exchange code for token');
  }

  const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string };
  if (!tokenData.access_token) {
    throw new HttpError(502, 'GITHUB_ERROR', tokenData.error ?? 'No access_token in response');
  }

  const accessToken = tokenData.access_token;
  const authHeader = `token ${accessToken}`;

  // Fetch the authenticated GitHub user
  const [userRes, emailsRes] = await Promise.all([
    fetch('https://api.github.com/user', {
      headers: { Authorization: authHeader, 'User-Agent': 'jlog/1.0' },
    }),
    fetch('https://api.github.com/user/emails', {
      headers: { Authorization: authHeader, 'User-Agent': 'jlog/1.0' },
    }),
  ]);

  if (!userRes.ok || !emailsRes.ok) {
    throw new HttpError(502, 'GITHUB_ERROR', 'Failed to fetch user from GitHub');
  }

  const githubUser = githubUserSchema.parse(await userRes.json());
  const rawEmails = (await emailsRes.json()) as unknown[];
  const emailList = rawEmails.map((e) => githubEmailSchema.parse(e));

  // Prefer the verified primary email; fall back to the profile email
  const primaryEmail =
    emailList.find((e) => e.primary && e.verified)?.email ??
    emailList.find((e) => e.verified)?.email ??
    githubUser.email;

  if (!primaryEmail) {
    throw new HttpError(400, 'NO_EMAIL', 'GitHub account has no verified email address');
  }

  const displayName = githubUser.name ?? githubUser.login;
  const db = createDb(c.env.DB);

  // Upsert the user — update profile fields on conflict
  const userId = crypto.randomUUID();
  await db
    .insert(users)
    .values({
      id: userId,
      githubId: githubUser.id,
      email: primaryEmail,
      name: displayName,
      avatarUrl: githubUser.avatar_url,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: users.githubId,
      set: {
        email: primaryEmail,
        name: displayName,
        avatarUrl: githubUser.avatar_url,
      },
    });

  // Re-fetch the user to get the canonical ID (may differ from the one we generated)
  const [savedUser] = await db.select().from(users).where(eq(users.githubId, githubUser.id));
  if (!savedUser) {
    throw new HttpError(500, 'DB_ERROR', 'Failed to retrieve user after upsert');
  }

  // Create a new session valid for 30 days
  const sessionId = await generateId(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  await db.insert(sessions).values({
    id: sessionId,
    userId: savedUser.id,
    expiresAt,
  });

  const signedSession = await sign(sessionId, c.env.SESSION_SECRET);

  setCookie(c, 'jlog_session', signedSession, {
    httpOnly: true,
    secure: !isLocalhost,
    // SameSite=None so the browser sends this cookie on cross-origin fetch
    // requests from jlog-web.pages.dev to jlog-api.brgv95.workers.dev.
    // No domain attribute — workers.dev is on the public suffix list and
    // browsers reject cookies that try to set a domain on PSL entries.
    sameSite: isLocalhost ? 'Lax' : 'None',
    maxAge: SESSION_TTL_SECONDS,
    path: '/',
  });

  return c.redirect(`${c.env.WEB_ORIGIN}/dashboard`);
});

router.post('/logout', async (c) => {
  const session = c.var.session;

  if (session) {
    const db = createDb(c.env.DB);
    await db.delete(sessions).where(eq(sessions.id, session.sessionId));
  }

  deleteCookie(c, 'jlog_session', { path: '/' });

  return c.json({ ok: true });
});

router.get('/me', async (c) => {
  const session = c.var.session;

  if (!session) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Not authenticated');
  }

  const db = createDb(c.env.DB);
  const [user] = await db.select().from(users).where(eq(users.id, session.userId));

  if (!user) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Not authenticated');
  }

  return c.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl ?? null,
    },
  });
});

export default router;
