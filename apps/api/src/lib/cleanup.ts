import { authSessions, authVerifications, createDb, extensionKeys } from '@jlog/db';
import { lt } from 'drizzle-orm';
import type { Env } from '../index';

/**
 * The nightly sweep of credentials that have run out.
 *
 * Every one of these was already cleared *opportunistically* — Better Auth
 * drops expired verifications the next time anyone follows a magic link, and
 * the extension routes prune expired keys whenever their owner opens Settings.
 * That is fine for an active account and useless for a dormant one: someone who
 * stops using jlog leaves their rows behind indefinitely, because the cleanup
 * only ever ran on their own next visit.
 *
 * The privacy policy says these are cleared automatically. This is what makes
 * that sentence true rather than nearly true.
 */

/**
 * How long an expired extension key is kept before it is swept.
 *
 * Not zero, deliberately. Expired keys are left in the table on purpose so the
 * extension popup can answer "this key expired on Tuesday" rather than "unknown
 * key" — which is the difference between a useful message and a confusing one,
 * and the reason that behaviour exists at all. Deleting them the same night
 * would quietly undo it. A month is long enough that anyone coming back to a
 * broken extension still gets the real explanation, and short enough that the
 * row does not outlive its usefulness by years.
 */
const EXTENSION_KEY_GRACE_DAYS = 30;

export type CleanupResult = {
  verifications: number;
  sessions: number;
  extensionKeys: number;
};

export async function runScheduledCleanup(env: Env): Promise<CleanupResult> {
  const db = createDb(env.DB);
  const now = new Date();

  // Outstanding magic links. These live fifteen minutes and nothing depends on
  // them afterwards, so an expired one is pure residue — and it is residue that
  // records an email address, which is the part worth removing.
  const verifications = await db
    .delete(authVerifications)
    .where(lt(authVerifications.expiresAt, now))
    .returning({ id: authVerifications.id });

  // Expired browser sessions. Unusable the moment they lapse: the session
  // middleware rejects them, so keeping the row buys nothing.
  const sessions = await db
    .delete(authSessions)
    .where(lt(authSessions.expiresAt, now))
    .returning({ id: authSessions.id });

  const graceCutoff = new Date(now.getTime() - EXTENSION_KEY_GRACE_DAYS * 24 * 60 * 60 * 1000);
  const keys = await db
    .delete(extensionKeys)
    .where(lt(extensionKeys.expiresAt, graceCutoff))
    .returning({ id: extensionKeys.id });

  return {
    verifications: verifications.length,
    sessions: sessions.length,
    extensionKeys: keys.length,
  };
}
