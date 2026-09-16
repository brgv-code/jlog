/**
 * The parts of a CV that are not career claims: your name, contact details, and
 * the skills / education / languages blocks.
 *
 * These deliberately do NOT live in `profile_facts`. That table is the verified
 * source of truth for things you did, and the tailoring agent may only select
 * from it. Your email address is not a claim anyone needs to audit, and mixing
 * the two would blunt what makes the fact gate meaningful.
 *
 * Stored server-side in `cv_profiles`. It was localStorage, which meant one
 * cleared browser lost the one thing the LaTeX header cannot render without,
 * and a second machine never had it at all.
 */
import type { CvProfileInput } from '@jlog/shared';
import { apiFetch } from './api';

export type CvProfile = CvProfileInput;
export type CvSection = CvProfile['sections'][number];

/** Where the browser-local profile lived before `cv_profiles` existed. */
const LEGACY_KEY = 'jlog_cv_profile';

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

/** A name is the one thing the LaTeX header cannot render without. */
export function isProfileUsable(p: CvProfile): boolean {
  return p.firstName.trim() !== '' && p.lastName.trim() !== '';
}

function readLegacyProfile(): CvProfile | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    // Spread over the default so a profile saved before a field existed still
    // loads, rather than putting undefined in an input.
    return { ...EMPTY_PROFILE, ...(JSON.parse(raw) as Partial<CvProfile>) };
  } catch {
    return null;
  }
}

export async function saveCvProfile(profile: CvProfile): Promise<void> {
  const res = await apiFetch('/api/profile/cv', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  });
  if (!res.ok) throw new Error(`Could not save the CV profile (${res.status}).`);
}

/**
 * The stored profile, lifting a browser-local one on first run.
 *
 * The lift only happens when the server has nothing: once a profile exists
 * server-side it is the answer, and an older browser's copy must not overwrite
 * edits made anywhere else. The local copy is dropped only after the upload
 * succeeds, so a failed lift can be retried on the next load.
 */
export async function loadCvProfile(): Promise<CvProfile> {
  const res = await apiFetch('/api/profile/cv');
  if (!res.ok) throw new Error(`Could not load the CV profile (${res.status}).`);
  const { profile, stored } = (await res.json()) as { profile: CvProfile; stored: boolean };

  if (stored) return profile;

  const legacy = readLegacyProfile();
  if (!legacy || !isProfileUsable(legacy)) return profile;

  await saveCvProfile(legacy);
  localStorage.removeItem(LEGACY_KEY);
  return legacy;
}
