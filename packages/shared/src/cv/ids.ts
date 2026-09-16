/**
 * Deterministic ids for imported facts.
 *
 * Byte-identical to `packages/db/scripts/import-cv-corpus.mjs`, and that is the
 * point: someone whose facts were seeded by the corpus scripts can paste the
 * same CV into the app without doubling their history. Same employer, same
 * phrasing, same row.
 *
 * SHA-1 through Web Crypto rather than node:crypto, so one implementation runs
 * in the worker and in the browser. It is a content address, not a signature.
 */

import { normaliseVariantContent } from '../schemas';

/**
 * The same normalisation the variant content hash already uses. Re-declaring it
 * here would let the two drift, and the drift would only show up as duplicate
 * rows in someone's history.
 */
export const normalise = normaliseVariantContent;

async function sha1(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-1', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Keyed on employer plus canonical phrasing. Re-wording a fact therefore gives
 * it a new id — the known limit of the scheme, and why editing a fact has to go
 * through an update rather than a re-import.
 */
export async function factIdFor(employer: string, canonical: string): Promise<string> {
  return `pf_${(await sha1(`${employer}|${normalise(canonical)}`)).slice(0, 24)}`;
}

/**
 * Hashed rather than sliced from the name: a prefix of the raw bytes collides
 * for anything sharing a leading substring, which once merged "Foundamental VC"
 * and "Foundamental GmbH" into one role.
 */
export async function roleFactIdFor(employer: string): Promise<string> {
  return `pf_role_${(await sha1(employer)).slice(0, 20)}`;
}

/** Matches the unique index over (user_id, content_hash). */
export async function variantHashFor(content: string): Promise<string> {
  return (await sha1(normalise(content))).slice(0, 32);
}

export const variantIdFor = (contentHash: string): string => `pv_${contentHash.slice(0, 24)}`;
