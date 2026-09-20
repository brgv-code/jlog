import { type CvTemplate, DEFAULT_TEMPLATE } from './templates';

/**
 * Suggest a template from an application's location.
 *
 * Per ADR-010 this only ever *suggests*. A profile default stands until a
 * confident signal overrides it, and the user always sees which signal fired.
 * The alternative — a profile-only setting — is modal state you set for one US
 * application and forget to set back, and the cost of forgetting is a photo on
 * a US CV.
 *
 * Deliberately conservative. "Remote" carries no market, and guessing one from
 * nothing is worse than falling back to a default the user chose.
 */

export interface TemplateSuggestion {
  template: CvTemplate;
  /** The substring that decided it, for showing the user why. */
  reason: string | null;
  confident: boolean;
}

/** Word-boundary matched, so "Indiana" never reads as "India". */
function hasToken(haystack: string, token: string): boolean {
  return new RegExp(`(^|[^a-z])${token}([^a-z]|$)`, 'i').test(haystack);
}

const US_STATES = [
  'al',
  'ak',
  'az',
  'ar',
  'ca',
  'co',
  'ct',
  'de',
  'fl',
  'ga',
  'hi',
  'id',
  'il',
  'in',
  'ia',
  'ks',
  'ky',
  'la',
  'me',
  'md',
  'ma',
  'mi',
  'mn',
  'ms',
  'mo',
  'mt',
  'ne',
  'nv',
  'nh',
  'nj',
  'nm',
  'ny',
  'nc',
  'nd',
  'oh',
  'ok',
  'or',
  'pa',
  'ri',
  'sc',
  'sd',
  'tn',
  'tx',
  'ut',
  'vt',
  'va',
  'wa',
  'wv',
  'wi',
  'wy',
  'dc',
];

const US_WORDS = ['united states', 'usa', 'u.s.', 'u.s.a'];
const INDIA_WORDS = [
  'india',
  'bengaluru',
  'bangalore',
  'hyderabad',
  'mumbai',
  'pune',
  'chennai',
  'gurgaon',
  'noida',
  'delhi',
];
const EUROPE_WORDS = [
  'europe',
  'eu',
  'emea',
  'germany',
  'deutschland',
  'france',
  'spain',
  'italy',
  'netherlands',
  'portugal',
  'poland',
  'sweden',
  'norway',
  'denmark',
  'finland',
  'ireland',
  'austria',
  'switzerland',
  'belgium',
  'czechia',
  'romania',
  'greece',
  'united kingdom',
  'uk',
  'berlin',
  'munich',
  'münchen',
  'hamburg',
  'paris',
  'madrid',
  'barcelona',
  'amsterdam',
  'lisbon',
  'lisboa',
  'dublin',
  'zurich',
  'zürich',
  'vienna',
  'wien',
  'london',
  'stockholm',
  'copenhagen',
  'warsaw',
  'prague',
  'milan',
  'rome',
];

export function suggestTemplate(
  location: string | null | undefined,
  fallback: CvTemplate = DEFAULT_TEMPLATE,
): TemplateSuggestion {
  const raw = (location ?? '').trim();
  if (!raw) return { template: fallback, reason: null, confident: false };
  const text = raw.toLowerCase();

  // Order matters, and the bare two-letter code goes last.
  //
  // Country codes collide with US state codes across the board: DE is Delaware
  // and Germany, IN is Indiana and India, and OK/OR/PA/LA/MA are all both. A
  // full country or city name is unambiguous, so those resolve first and the
  // two-letter token is only ever a last resort.
  for (const word of INDIA_WORDS) {
    if (hasToken(text, word)) return { template: 'india', reason: raw, confident: true };
  }
  for (const word of US_WORDS) {
    if (text.includes(word)) return { template: 'us', reason: raw, confident: true };
  }
  for (const word of EUROPE_WORDS) {
    if (hasToken(text, word)) return { template: 'europe', reason: raw, confident: true };
  }
  // Only after a comma — "Austin, TX" is Texas; a bare "in" in prose is not
  // Indiana.
  const afterComma = text.split(',').slice(1).join(',').trim();
  if (afterComma) {
    for (const state of US_STATES) {
      if (new RegExp(`(^|\\s)${state}(\\s|$)`).test(afterComma)) {
        return { template: 'us', reason: raw, confident: true };
      }
    }
  }

  return { template: fallback, reason: null, confident: false };
}
