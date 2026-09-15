/**
 * The parts of a CV that are not career claims: your name, contact details, and
 * the skills / education / languages blocks.
 *
 * These deliberately do NOT live in `profile_facts`. That table is the verified
 * source of truth for things you did, and the tailoring agent may only select
 * from it. Your email address is not a claim anyone needs to audit, and mixing
 * the two would blunt what makes the fact gate meaningful.
 *
 * Stored client-side for now. The `user_documents` table is where this belongs —
 * it already models a base template with assets — and moving it there is what
 * lets the photo travel with the document instead of being re-attached by hand.
 */

export type CvSection = { heading: string; items: { left: string; right: string }[] };

export type CvProfile = {
  firstName: string;
  lastName: string;
  title: string;
  address: string;
  email: string;
  homepage: string;
  photo: string;
  socials: { network: string; handle: string }[];
  summary: string;
  sections: CvSection[];
};

const KEY = 'jlog_cv_profile';

export const EMPTY_PROFILE: CvProfile = {
  firstName: '',
  lastName: '',
  title: '',
  address: '',
  email: '',
  homepage: '',
  photo: '',
  socials: [],
  summary: '',
  sections: [],
};

export function loadCvProfile(): CvProfile {
  if (typeof localStorage === 'undefined') return EMPTY_PROFILE;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY_PROFILE;
    // Spread over the default so a profile saved before a field existed still
    // loads, rather than rendering undefined into an input.
    return { ...EMPTY_PROFILE, ...(JSON.parse(raw) as Partial<CvProfile>) };
  } catch {
    return EMPTY_PROFILE;
  }
}

export function saveCvProfile(profile: CvProfile): void {
  localStorage.setItem(KEY, JSON.stringify(profile));
}

/** A name is the one thing the LaTeX header cannot render without. */
export function isProfileUsable(p: CvProfile): boolean {
  return p.firstName.trim() !== '' && p.lastName.trim() !== '';
}
