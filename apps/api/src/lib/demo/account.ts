import { createDb, users } from '@jlog/db';
import { eq } from 'drizzle-orm';

/**
 * What makes an account a demo account: its address is on this domain.
 *
 * An address rather than a column, so the feature needs no migration and a
 * demo row is recognisable at a glance in the database. Nothing is ever sent
 * to these addresses, and the magic-link path refuses them, so a stranger
 * cannot create a "real" account that is treated as a demo one.
 */
export const DEMO_EMAIL_DOMAIN = 'demo.jlog.ai';

/** How long a demo account lives before the nightly sweep removes it. */
export const DEMO_TTL_MS = 24 * 60 * 60 * 1000;

export function isDemoEmail(email: string | null | undefined): boolean {
  return Boolean(email?.toLowerCase().endsWith(`@${DEMO_EMAIL_DOMAIN}`));
}

/** Whether demo accounts can be created on this deployment. Off unless switched on. */
export function isDemoEnabled(env: { DEMO_ENABLED?: string }): boolean {
  return env.DEMO_ENABLED === 'true';
}

/**
 * Whether a signed-in user is a demo account. One indexed read; called only on
 * the paths that behave differently for a demo (model calls, billing, the
 * provider settings), never on every request.
 */
export async function isDemoUser(db: D1Database, userId: string): Promise<boolean> {
  const [row] = await createDb(db)
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId));
  return isDemoEmail(row?.email);
}
