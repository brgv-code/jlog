import { applications, createDb, cvSources, documents, users } from '@jlog/db';
import { APIError } from 'better-auth/api';
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
 *     subscription does not tell Stripe anything.
 *   - **The files.** Imported CVs, rendered PDFs and the profile photo are
 *     bytes in R2, keyed from rows that are about to vanish.
 *
 * Called from Better Auth's `beforeDelete` hook — before, deliberately, because
 * it needs the rows it is reading.
 *
 * **Every failure here aborts the deletion**, and that is the important design
 * decision in this file. The tempting alternative is to log and carry on, so
 * that a transient Stripe or R2 outage cannot leave someone unable to delete
 * their account. But carrying on destroys the only record of what still needs
 * cleaning: once the user row is gone, nothing knows the subscription id to
 * cancel or the object keys to delete. A person who deletes their account and
 * then keeps being charged for it, or whose CV stays in storage, has been
 * wronged far worse than one who is asked to try again in a minute.
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
    // A subscription Stripe has already cancelled, or has never heard of, is
    // not a failure: the state we wanted is the state it is in. Anything else —
    // a network blip, a rate limit, an outage — must stop the deletion, because
    // continuing would delete the only copy of the id needed to try again.
    if (isAlreadyGone(err)) return;

    console.error('[account] could not cancel subscription; deletion aborted', err);
    throw new APIError('INTERNAL_SERVER_ERROR', {
      message:
        'We could not cancel your subscription just now, so your account has not been deleted — ' +
        'deleting it while the subscription is live would keep you being charged. Please try again ' +
        'in a few minutes.',
    });
  }
}

/** Stripe's word for "that subscription is not there", which is a success here. */
function isAlreadyGone(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const code = (err as { code?: string; statusCode?: number }).code;
  const status = (err as { statusCode?: number }).statusCode;
  return code === 'resource_missing' || status === 404;
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

  const keys = [
    ...sources.map((row) => row.key),
    ...generated.map((row) => row.key),
    // The profile photo. Unlike the others its key is derived from the user id
    // rather than stored in a column, so there is no row to find it by — which
    // is exactly why it is easy to forget and would have been left behind. Both
    // extensions are attempted because only one of them exists and the row does
    // not record which.
    ...PHOTO_EXTENSIONS.map((ext) => `photo/${userId}.${ext}`),
  ].filter((key): key is string => Boolean(key));

  if (keys.length === 0) return;

  try {
    // R2 takes up to 1000 keys per call. Chunked rather than assumed, because
    // a long job search with a tailored CV per application reaches that.
    // Deleting a key that does not exist is a no-op, which is what makes
    // attempting both photo extensions safe.
    for (let i = 0; i < keys.length; i += 1000) {
      await bucket.delete(keys.slice(i, i + 1000));
    }
  } catch (err) {
    // Aborts for the same reason as a failed cancellation: the rows naming
    // these objects are about to be deleted, and once they are, nothing can
    // find the files again. Leaving someone's CV in storage permanently is a
    // worse outcome than asking them to retry.
    //
    // There is a real cost to that choice, worth naming rather than hiding.
    // Past the first 1000 keys the deletion is several calls, so a failure on a
    // later one leaves the account intact while some of its files are already
    // gone — download a document from that account and it will 404.
    //
    // It is still the better of the two failures. This state is *transient and
    // self-healing*: deleting an absent key is a no-op in R2, so simply trying
    // again finishes the job. Doing the work after the rows were deleted
    // instead would trade it for orphaned personal files that nothing can ever
    // find — permanent, invisible, and the exact thing deletion was asked for.
    // So the message below says plainly that a retry is both safe and needed.
    console.error('[account] could not delete stored files; deletion aborted', err);
    throw new APIError('INTERNAL_SERVER_ERROR', {
      message:
        'We could not remove all of your stored files, so your account has not been deleted — we ' +
        'would rather not leave your CV behind. Some files may already have been removed; trying ' +
        'again in a few minutes will finish the job safely.',
    });
  }
}

/** Mirrors the extensions `routes/profile.ts` will store a photo under. */
const PHOTO_EXTENSIONS = ['jpg', 'png'] as const;
