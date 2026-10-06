import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthEndpoint } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import type { Env } from '../../index';
import { DEMO_TTL_MS, isDemoEnabled } from './account';
import { createDemoAccount } from './seed';

/**
 * `POST /api/auth/demo/sign-in`: make a fresh demo account and sign into it.
 *
 * A Better Auth endpoint rather than a jlog route, because the session cookie
 * has to be exactly the one the library would set for any other sign-in:
 * same name, same signature, same attributes. Asking the library to set it is
 * the only way that stays true when the library changes.
 *
 * The user row is written by jlog, not by `internalAdapter.createUser`, so the
 * invite-only hook never sees it: a demo is the one account an invite-only
 * instance should still hand out to anyone.
 */
export function demoAccount(env: Env): BetterAuthPlugin {
  return {
    id: 'jlog-demo',
    endpoints: {
      demoSignIn: createAuthEndpoint('/demo/sign-in', { method: 'POST' }, async (ctx) => {
        if (!isDemoEnabled(env)) {
          throw new APIError('NOT_FOUND', {
            message: 'The demo account is not available on this instance.',
          });
        }

        const account = await createDemoAccount(env);
        const user = await ctx.context.internalAdapter.findUserById(account.userId);
        if (!user) {
          throw new APIError('INTERNAL_SERVER_ERROR', {
            message: 'Could not set up the demo account. Please try again.',
          });
        }

        // The session dies with the account, rather than outliving it as a
        // cookie that points at a deleted user.
        const session = await ctx.context.internalAdapter.createSession(user.id, false, {
          expiresAt: new Date(Date.now() + DEMO_TTL_MS),
        });
        await setSessionCookie(ctx, { session, user });

        return ctx.json({
          user: { id: user.id, name: user.name },
          applications: account.applications,
        });
      }),
    },
    // Generous on purpose: a room on venue Wi-Fi is many people behind one IP.
    rateLimit: [
      {
        pathMatcher: (path) => path === '/demo/sign-in',
        window: 60,
        max: 30,
      },
    ],
  } satisfies BetterAuthPlugin;
}
