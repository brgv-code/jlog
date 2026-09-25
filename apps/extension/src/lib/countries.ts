/**
 * Which country a work-authorisation question is about. ADR-012 phase 2.
 *
 * Short codes ("US", "UK") are matched case-sensitively against the label as the
 * board wrote it, because lowercased "us" is in "tell us about yourself". Names
 * are matched case-insensitively on word boundaries.
 */

interface Country {
  id: string;
  /** Case-insensitive, whole words. */
  names: string[];
  /** Case-sensitive, whole words. */
  codes?: string[];
  eu?: boolean;
}

const COUNTRIES: Country[] = [
  {
    id: 'us',
    names: ['united states', 'united states of america'],
    codes: ['US', 'U.S.', 'USA', 'U.S.A.'],
  },
  {
    id: 'uk',
    names: ['united kingdom', 'great britain', 'britain', 'england', 'scotland', 'wales'],
    codes: ['UK', 'U.K.'],
  },
  { id: 'ca', names: ['canada'] },
  { id: 'ch', names: ['switzerland'] },
  { id: 'no', names: ['norway'] },
  { id: 'au', names: ['australia'] },
  { id: 'nz', names: ['new zealand'] },
  { id: 'in', names: ['india'] },
  { id: 'sg', names: ['singapore'] },
  { id: 'il', names: ['israel'] },
  { id: 'jp', names: ['japan'] },
  { id: 'br', names: ['brazil'] },
  { id: 'mx', names: ['mexico'] },
  { id: 'ae', names: ['united arab emirates'], codes: ['UAE'] },
  { id: 'at', names: ['austria'], eu: true },
  { id: 'be', names: ['belgium'], eu: true },
  { id: 'bg', names: ['bulgaria'], eu: true },
  { id: 'hr', names: ['croatia'], eu: true },
  { id: 'cy', names: ['cyprus'], eu: true },
  { id: 'cz', names: ['czech republic', 'czechia'], eu: true },
  { id: 'dk', names: ['denmark'], eu: true },
  { id: 'ee', names: ['estonia'], eu: true },
  { id: 'fi', names: ['finland'], eu: true },
  { id: 'fr', names: ['france'], eu: true },
  { id: 'de', names: ['germany', 'deutschland'], eu: true },
  { id: 'gr', names: ['greece'], eu: true },
  { id: 'hu', names: ['hungary'], eu: true },
  { id: 'ie', names: ['ireland'], eu: true },
  { id: 'it', names: ['italy'], eu: true },
  { id: 'lv', names: ['latvia'], eu: true },
  { id: 'lt', names: ['lithuania'], eu: true },
  { id: 'lu', names: ['luxembourg'], eu: true },
  { id: 'mt', names: ['malta'], eu: true },
  { id: 'nl', names: ['netherlands', 'the netherlands', 'holland'], eu: true },
  { id: 'pl', names: ['poland'], eu: true },
  { id: 'pt', names: ['portugal'], eu: true },
  { id: 'ro', names: ['romania'], eu: true },
  { id: 'sk', names: ['slovakia'], eu: true },
  { id: 'si', names: ['slovenia'], eu: true },
  { id: 'es', names: ['spain'], eu: true },
  { id: 'se', names: ['sweden'], eu: true },
];

const EU_NAMES = ['eu', 'european union', 'europe', 'eea'];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function mentions(text: string, c: Country): boolean {
  const lower = text.toLowerCase();
  if (c.names.some((n) => new RegExp(`\\b${escapeRe(n)}\\b`).test(lower))) return true;
  // Codes can end in a dot, where \b would not match, so the edges are explicit.
  return (c.codes ?? []).some((code) =>
    new RegExp(`(^|[^A-Za-z])${escapeRe(code)}(?![A-Za-z])`).test(text),
  );
}

/** The ids of every country a label names. */
export function countriesIn(label: string): string[] {
  return COUNTRIES.filter((c) => mentions(label, c)).map((c) => c.id);
}

/**
 * The country ids a user's own list covers. "EU" (or "Europe", "EEA") covers
 * every member state, which is what an EU citizen means by it.
 */
export function resolveAuthorized(entries: string[]): Set<string> {
  const ids = new Set<string>();
  for (const raw of entries) {
    const entry = raw.trim();
    if (EU_NAMES.includes(entry.toLowerCase())) {
      for (const c of COUNTRIES) if (c.eu) ids.add(c.id);
      continue;
    }
    for (const c of COUNTRIES) {
      if (c.names.includes(entry.toLowerCase()) || c.codes?.includes(entry.toUpperCase())) {
        ids.add(c.id);
      }
    }
  }
  return ids;
}

/**
 * Whether the user may work in the one country a question names. Null when the
 * question names no country or several, because "the country this role is in"
 * and "the US or Canada" cannot be answered from a list.
 */
export function authorizedFor(label: string, authorized: Set<string>): boolean | null {
  const named = countriesIn(label);
  if (named.length !== 1) return null;
  return authorized.has(named[0] as string);
}
