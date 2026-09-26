import { authAccounts, authSessions, authVerifications, createDb, users } from '@jlog/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import { magicLink } from 'better-auth/plugins';
import type { Env } from '../index';
import { cleanupBeforeAccountDeletion } from './accountDeletion';
import { getAppleClientSecret, isAppleConfigured } from './apple';
import { getMailer, magicLinkMessage } from './email';

/**
 * jlog's Better Auth instance.
 *
 * Built per request rather than once per process, because workerd hands
 * credentials and the D1 binding in through `env` on each invocation — there is
 * no module-level moment at which they are known.
 *
 * Better Auth owns sessions, the account table and the magic-link tokens. It
 * does not own the `users` table: that is mapped onto the existing one so
 * jlog's own columns (plan, Stripe ids) stay where every route already looks
 * for them.
 */

/** 30 days, matching what jlog's own sessions used to last. */
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
/** How long an emailed sign-in link works for. */
const MAGIC_LINK_TTL_SECONDS = 15 * 60;

export type Auth = ReturnType<typeof createAuth>;

/**
 * Credentials that have to be computed rather than read, resolved before the
 * config is built because `betterAuth` takes a plain object.
 */
type ResolvedSecrets = { appleClientSecret: string | null };

/**
 * Which sign-in methods this deployment can actually offer.
 *
 * Every one is optional. A self-hoster may well run with GitHub alone and no
 * mail domain at all, so the login page asks rather than assuming, and an
 * unconfigured provider is simply never registered.
 */
export function availableProviders(env: Env) {
  return {
    github: Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
    google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    apple: isAppleConfigured(env),
    email: getMailer(env) !== null,
  };
}

/**
 * The same answer as {@link availableProviders}, except that Apple is only
 * reported as available if its key can actually produce a client secret.
 *
 * Four settings being present is not the same as them being right. Without this
 * check the login page would offer an Apple button that cannot work, and the
 * person pressing it would get an opaque failure from Apple rather than simply
 * not seeing the button. The signature is cached per key, so on the warm path
 * this costs nothing.
 */
export async function resolvedProviders(env: Env) {
  const providers = availableProviders(env);
  if (!providers.apple) return providers;

  try {
    await getAppleClientSecret(env);
    return providers;
  } catch {
    return { ...providers, apple: false };
  }
}

/**
 * A readable display name from an address, for accounts whose sign-in method
 * gave us nothing better. "ada.lovelace@example.com" becomes "ada lovelace".
 */
export function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? '';
  return local.replace(/[._-]+/g, ' ').trim() || 'there';
}

export function createAuth(env: Env, requestUrl: string, secrets: ResolvedSecrets) {
  const db = createDb(env.DB);
  const enabled = availableProviders(env);

  // Where this worker is reachable. Derived from the request so local, preview
  // and production each get the right value with nothing to keep in sync;
  // API_ORIGIN overrides it when something in front rewrites the host.
  const baseURL = env.API_ORIGIN ?? new URL(requestUrl).origin;
  const isLocalhost = env.COOKIE_DOMAIN === 'localhost';

  return betterAuth({
    baseURL,
    basePath: '/api/auth',
    // Reuses the existing session secret so a deployment has one fewer thing to
    // generate; BETTER_AUTH_SECRET takes precedence if it is ever set
    // separately. Changing either signs everyone out, which is the point.
    secret: env.BETTER_AUTH_SECRET ?? env.SESSION_SECRET,

    database: drizzleAdapter(db, {
      provider: 'sqlite',
      // Keyed by model name, which is why the table exports are named to match
      // the `modelName` values below.
      schema: { users, authSessions, authAccounts, authVerifications },
    }),

    // The web app and the extension are on different origins from this worker,
    // so both have to be named explicitly before Better Auth will accept a
    // sign-in initiated from them or redirect back to them.
    trustedOrigins: [env.WEB_ORIGIN, `chrome-extension://${env.EXTENSION_ID}`],

    user: {
      modelName: 'users',
      fields: {
        // jlog called it avatarUrl long before Better Auth was involved.
        image: 'avatarUrl',
      },
      additionalFields: {
        /**
         * Carried on the session so a caller can see the entitlement without a
         * second query. `input: false` is the important half: it means nobody
         * can set their own plan by including it in a sign-up request.
         */
        plan: {
          type: 'string',
          required: false,
          defaultValue: 'free',
          input: false,
        },
      },

      deleteUser: {
        enabled: true,
        /**
         * Runs while the user's rows still exist, which is the point: it
         * cancels their Stripe subscription and collects the R2 objects that
         * only these rows know the keys of. Everything else is handled by the
         * foreign keys cascading from the `users` row.
         *
         * No email confirmation step. The address is already proven — that is
         * how they signed in — and requiring a mailer here would mean a
         * self-hoster without one could never delete an account at all. The
         * confirmation is the typed one in Settings.
         */
        beforeDelete: async (user) => {
          await cleanupBeforeAccountDeletion(env, user.id);
        },
      },
    },

    session: {
      modelName: 'authSessions',
      expiresIn: SESSION_TTL_SECONDS,
      // Slide the expiry at most once a day rather than on every request, so a
      // busy session is not also a write-heavy one.
      updateAge: 24 * 60 * 60,
    },

    account: {
      modelName: 'authAccounts',
      accountLinking: {
        // What makes "sign in with Google, having signed up with GitHub" land
        // in the existing account rather than minting an empty second one.
        enabled: true,
        // Linking happens on a matching address, so the list may only contain
        // providers that verify the address they report. A provider that let
        // someone type any address unchecked would, if trusted here, be a way
        // to walk into another person's account by claiming their address.
        trustedProviders: ['github', 'google', 'apple'],
      },
    },

    verification: { modelName: 'authVerifications' },

    // Passwords are deliberately not an option: the four methods here all prove
    // an address or an account, and none of them leaves a hash worth stealing.
    emailAndPassword: { enabled: false },

    databaseHooks: {
      user: {
        create: {
          /**
           * Give an account a display name when the sign-in method supplied
           * none.
           *
           * GitHub and Google both send one. An emailed link sends nothing, and
           * Apple sends a name only on the very first authorization — so
           * without this a magic-link account is created with an empty name and
           * the sidebar shows a blank where a person should be.
           */
          before: async (user) => {
            if (user.name?.trim()) return { data: user };
            return { data: { ...user, name: nameFromEmail(user.email) } };
          },
        },
      },
    },

    socialProviders: {
      ...(enabled.github && {
        github: {
          clientId: env.GITHUB_CLIENT_ID,
          clientSecret: env.GITHUB_CLIENT_SECRET,
        },
      }),
      ...(enabled.google && {
        google: {
          clientId: env.GOOGLE_CLIENT_ID as string,
          clientSecret: env.GOOGLE_CLIENT_SECRET as string,
          // Without this, anyone already signed into exactly one Google account
          // is silently signed in as that one, which is maddening on a shared
          // machine.
          prompt: 'select_account',
        },
      }),
      ...(enabled.apple &&
        secrets.appleClientSecret && {
          apple: {
            clientId: env.APPLE_CLIENT_ID as string,
            // Apple issues no secret string: you sign a short-lived assertion
            // with a downloaded key on each exchange. See lib/apple.ts.
            clientSecret: secrets.appleClientSecret,
            // Lets a future native iOS build sign in with an identity token.
            ...(env.APPLE_BUNDLE_ID && { appBundleIdentifier: env.APPLE_BUNDLE_ID }),
          },
        }),
    },

    plugins: [
      magicLink({
        expiresIn: MAGIC_LINK_TTL_SECONDS,
        // Store the hash, not the token. The copy in someone's inbox is then
        // the only working one, and a dump of the verification table is a list
        // of hashes rather than a bundle of live sign-in links.
        storeToken: 'hashed',
        async sendMagicLink({ email, url }) {
          const mailer = getMailer(env);
          if (!mailer) {
            // Reached only if mail credentials disappear between the login page
            // asking which methods exist and someone using one of them.
            throw new APIError('SERVICE_UNAVAILABLE', {
              message: 'Email sign-in is not enabled on this instance.',
            });
          }

          try {
            await mailer.send({
              to: email,
              ...magicLinkMessage({
                link: url,
                minutesValid: Math.round(MAGIC_LINK_TTL_SECONDS / 60),
              }),
            });
          } catch (err) {
            // Without this the failure leaves the endpoint as a bare 500 with an
            // empty body, and the login page has nothing to show. The provider's
            // own reason — an unverified sending domain, most often — stays in
            // the logs rather than going to the browser.
            console.error('[auth] failed to send magic link', err);
            throw new APIError('INTERNAL_SERVER_ERROR', {
              message: 'We could not send the sign-in email. Please try again shortly.',
            });
          }
        },
      }),
    ],

    advanced: {
      defaultCookieAttributes: {
        httpOnly: true,
        // The web app calls this worker cross-origin, and a Lax cookie is not
        // sent on such a request. None requires Secure, which is why local
        // development — same machine, plain http — stays on Lax instead.
        sameSite: isLocalhost ? 'Lax' : 'None',
        secure: !isLocalhost,
      },
      // NOTE: `database.joins` is deliberately left off.
      //
      // It is Better Auth's documented performance switch — resolve the session
      // and its user in one query rather than two. Turning it on routes the
      // lookup through Drizzle's relational query API, and the adapter works out
      // which relation to traverse partly by guessing a pluralised name. With
      // jlog's table names that guess misses, and every authenticated request
      // fails with a 500 rather than merely being slower. A second small D1
      // query per request is the cheaper problem.
      database: {},
    },
  });
}

/**
 * The entry point the worker uses.
 *
 * Apple is the only provider whose credential must be computed rather than
 * read, and computing it is asynchronous, so it is resolved first and the
 * synchronous config built around the result. Passing it in rather than
 * stashing it in module scope matters: one isolate serves many requests
 * concurrently, and a shared mutable slot would let them overwrite each other's
 * secret mid-exchange.
 */
export async function getAuth(env: Env, requestUrl: string): Promise<Auth> {
  let appleClientSecret: string | null = null;

  if (isAppleConfigured(env)) {
    try {
      appleClientSecret = await getAppleClientSecret(env);
    } catch {
      // A malformed `.p8` makes signing throw. This runs on the way into
      // *every* request, so letting it propagate would turn one mistyped
      // secret into a 500 on the health check, on GitHub sign-in, on the
      // extension's requests and on the Stripe webhook — none of which involve
      // Apple at all. One broken provider takes out that provider and nothing
      // else: Apple is simply not registered, so the login page stops offering
      // it and everything else carries on.
      //
      // Deliberately silent here. `getAppleClientSecret` logs the reason once
      // per bad key and then remembers it, so this path neither re-imports the
      // key nor writes a line on every subsequent request.
    }
  }

  return createAuth(env, requestUrl, { appleClientSecret });
}
