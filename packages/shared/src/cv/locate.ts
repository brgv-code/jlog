/**
 * Finding a stored fact's words back in the CV they were read out of.
 *
 * Import turns a CV into `profile_facts` and, until now, threw the document
 * away. That made every generated bullet traceable to a row and to nothing a
 * human recognises — "pf_3f2a…" is not the line you wrote. Keeping the source
 * text and a character range per fact is what lets the tailoring view show a
 * bullet next to the line of your own CV it came from.
 *
 * The match is whitespace and case insensitive for the same reason
 * `toImportedCv` checks bullets that way: a PDF's line breaks are an artefact
 * of layout, not of what was written, so an exact `indexOf` on the raw text
 * fails on almost every bullet that wrapped. Offsets are still reported into
 * the ORIGINAL string, because that is what gets rendered and highlighted.
 */

import { normalise } from './ids';

/** A half-open character range `[start, end)` into the original source text. */
export type SourceSpan = [start: number, end: number];

type Folded = {
  /** `normalise`d text: whitespace runs collapsed to one space, lowercased. */
  text: string;
  /** For each character in `text`, its index in the original string. */
  origin: number[];
};

/**
 * `normalise` with the index map that lets a match be reported in original
 * coordinates. It must stay behaviourally identical to `normalise` — a fold
 * that disagrees would find matches at offsets the caller cannot highlight —
 * so `locate.test.ts` asserts the two agree character for character.
 */
function fold(source: string): Folded {
  const out: string[] = [];
  const origin: number[] = [];
  let pendingSpace = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i] as string;
    if (/\s/.test(ch)) {
      // Deferred rather than pushed: a run of whitespace becomes one space, and
      // trailing whitespace becomes nothing at all.
      pendingSpace = out.length > 0;
      continue;
    }
    if (pendingSpace) {
      out.push(' ');
      origin.push(i);
      pendingSpace = false;
    }
    out.push(ch.toLowerCase());
    origin.push(i);
  }

  return { text: out.join(''), origin };
}

/**
 * Where `needle` sits in `source`, or null if it is not there.
 *
 * `from` is a character offset in the ORIGINAL source to prefer matches after.
 * A CV repeats itself — two roles can carry the same line — and without it
 * every copy resolves to the first occurrence, so a later role's citation
 * points at an earlier role's text. A search that finds nothing after `from`
 * falls back to the whole document rather than losing the citation.
 */
export function locateInSource(source: string, needle: string, from = 0): SourceSpan | null {
  const hay = fold(source);
  const target = normalise(needle);
  if (!target) return null;
  return locateFolded(hay, target, foldedIndexAt(hay, from));
}

/**
 * The first folded position at or after an original-coordinate offset. Binary
 * search because `origin` is sorted by construction and `locateAll` would
 * otherwise re-scan the whole map once per bullet.
 */
function foldedIndexAt(hay: Folded, from: number): number {
  if (from <= 0) return 0;
  let lo = 0;
  let hi = hay.origin.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((hay.origin[mid] as number) < from) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function locateFolded(hay: Folded, target: string, from: number): SourceSpan | null {
  const after = hay.text.indexOf(target, from);
  // A search that finds nothing after the cursor falls back to the whole
  // document rather than losing the citation.
  const index = after === -1 ? hay.text.indexOf(target) : after;
  if (index === -1) return null;

  const start = hay.origin[index] as number;
  // The last matched character's origin, plus its own width. Reporting
  // `origin[index + length]` instead would swallow the whitespace that follows.
  const end = (hay.origin[index + target.length - 1] as number) + 1;
  return [start, end];
}

/**
 * Locate a whole import's worth of bullets in one pass, walking a cursor
 * forward so repeated lines resolve to successive occurrences.
 *
 * Returns one entry per input, `null` where the text is not in the source —
 * which happens legitimately: a fact imported before the source was kept, or
 * one whose wording was edited afterwards, has nothing to point at, and a
 * citation that quietly points at the wrong line is worse than one that admits
 * it has no line.
 */
export function locateAll(source: string, needles: string[]): (SourceSpan | null)[] {
  const hay = fold(source);
  let cursor = 0;
  return needles.map((needle) => {
    const target = normalise(needle);
    if (!target) return null;
    const at = hay.text.indexOf(target, cursor);
    const index = at === -1 ? hay.text.indexOf(target) : at;
    if (index === -1) return null;
    cursor = index + target.length;
    return [
      hay.origin[index] as number,
      (hay.origin[index + target.length - 1] as number) + 1,
    ] as SourceSpan;
  });
}
