/**
 * What an imported CV yields, before any of it is written down.
 *
 * One shape for every source format. A LaTeX file, a Markdown paste and (later)
 * a PDF all reduce to this, so the review step and the commit path are written
 * once rather than once per door.
 *
 * `chrome` is the non-claim half — name, contact, skills, education — and
 * mirrors the web app's `CvProfile`. `roles` is the half that becomes
 * `profile_facts`, which is the half a human has to approve.
 */

export type ImportedSection = { heading: string; items: { left: string; right: string }[] };

export type ImportedChrome = {
  firstName: string;
  lastName: string;
  title: string;
  address: string;
  email: string;
  homepage: string;
  photo: string;
  socials: { network: string; handle: string }[];
  summary: string;
  sections: ImportedSection[];
};

export type ImportedRole = {
  employer: string;
  roleTitle: string;
  /** Normalised to years ("2020--2024", "2025--current") — CV dates are imprecise. */
  dates: string;
  location: string;
  bullets: string[];
};

export type ImportedCv = {
  chrome: ImportedChrome;
  roles: ImportedRole[];
  /**
   * What the parser could not place. Shown in review rather than dropped: a
   * silently discarded bullet is indistinguishable from one the CV never had.
   */
  unplaced: string[];
};

export const EMPTY_CHROME: ImportedChrome = {
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

/**
 * Which parser a pasted CV needs. LaTeX announces itself with commands no
 * Markdown CV contains; everything else is read as Markdown, which degrades to
 * "a name and some bullets" rather than failing.
 */
export function detectCvFormat(source: string): 'latex' | 'markdown' {
  return /\\(documentclass|begin\{document\}|cventry|name\{)/.test(source) ? 'latex' : 'markdown';
}
