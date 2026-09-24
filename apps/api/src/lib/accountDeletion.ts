import { applications, createDb, cvSources, documents, users } from '@jlog/db';
import { and, eq, isNotNull } from 'drizzle-orm';
import Stripe from 'stripe';
import type { Env } from '../index';

/**
 * The parts of deleting an account that the database cannot do for itself.
 *
 * Every user-owned *row* goes on its own: the foreign keys cascade from
 * `users`, so removing that one row takes the applications, documents, CV
 * facts, LLM config and extension keys with it. Two things live outside that
 * and would otherwise be left behind:
 *
 *   - **The subscription.** Deleting the row that records a Stripe
 *     subscription does not tell Stripe anything. Someone who deletes their
 *     account and keeps being charged for it has been wronged in a way that is
 *     both obvious and entirely avoidable, so this is the load-bearing half.
 *   - **The files.** Imported CVs and rendered PDFs are bytes in R2, keyed from
 *     rows that are about to vanish. Once the rows are gone there is nothing
 *     left to find the objects by, so they have to be collected first.
 *
 * Called from Better Auth's `beforeDelete` hook — before, deliberately, because
 * it needs the rows it is reading.
 */
export async function cleanupBeforeAccountDeletion(env: Env, userId: string): Promise<void> {
  const db = createDb(env.DB);

  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return;

  await cancelSubscription(env, user.stripeSubscriptionId, user.planSource);
  await deleteStoredFiles(env, db, userId);
}

/**
 * Stop the billing before the account goes.
 *
 * `planSource` is checked as well as the id: a comped account (ADR-011) has no
 * Stripe subscription of its own, and an account whose plan was never Stripe's
 * to begin with is not Stripe's to cancel.
 *
 * Deliberately immediate rather than at period end. Someone deleting their
 * account is not asking to keep the service until the month is out.
 */
async function cancelSubscription(
  env: Env,
  subscriptionId: string | null,
  planSource: string | null,
): Promise<void> {
  if (!subscriptionId || planSource !== 'stripe' || !env.STRIPE_SECRET_KEY) return;

  const stripe = new Stripe(env.STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });

  try {
    await stripe.subscriptions.cancel(subscriptionId);
  } catch (err) {
    // An already-cancelled or unknown subscription is not a reason to refuse
    // someone their deletion — the outcome they asked for is the same either
    // way, and the alternative is an account they cannot get rid of.
    console.error('[account] could not cancel subscription during deletion', err);
  }
}

/** Collect every R2 key this user owns, then delete the objects. */
async function deleteStoredFiles(
  env: Env,
  db: ReturnType<typeof createDb>,
  userId: string,
): Promise<void> {
  const bucket = env.CV_FILES;
  if (!bucket) return;

  // The CVs they imported.
  const sources = await db
    .select({ key: cvSources.pdfKey })
    .from(cvSources)
    .where(and(eq(cvSources.userId, userId), isNotNull(cvSources.pdfKey)));

  // The documents generated for their applications. Reached through
  // `applications`, because a document belongs to an application rather than
  // to a user directly.
  const generated = await db
    .select({ key: documents.pdfKey })
    .from(documents)
    .innerJoin(applications, eq(documents.applicationId, applications.id))
    .where(and(eq(applications.userId, userId), isNotNull(documents.pdfKey)));

  const keys = [...sources, ...generated]
    .map((row) => row.key)
    .filter((key): key is string => Boolean(key));

  if (keys.length === 0) return;

  try {
    // R2 takes up to 1000 keys per call. Chunked rather than assumed, because
    // a long job search with a tailored CV per application reaches that.
    for (let i = 0; i < keys.length; i += 1000) {
      await bucket.delete(keys.slice(i, i + 1000));
    }
  } catch (err) {
    // Orphaned bytes are a storage bill, not a privacy breach — everything that
    // could identify whose they were is about to be deleted regardless. Worth
    // knowing about, not worth blocking the deletion over.
    console.error('[account] could not delete stored files during deletion', err);
  }
}
