/**
 * Read a plain-text CV — what falls out of a PDF's text layer.
 *
 * A PDF has no structure to read: extraction yields lines, and the headings,
 * jobs and bullets have to be recognised from how they are written. A model
 * does this better and is used when one is configured; this is what runs when
 * none is, and what catches a model call that fails. Neither path writes
 * anything without review, which is what makes a rough reading safe to show.
 *
 * The rules are the ones a person uses at a glance: a short line in caps or
 * naming a known section is a heading, a line carrying a date range under
 * Experience is a job, an indented or dashed line is a bullet.
 */
import {
  EMAIL,
  EXPERIENCE,
  SOCIALS,
  SUMMARY,
  URL,
  parseItem,
  parseRoleHeading,
  plain,
} from './markdown';
import { EMPTY_CHROME, type ImportedChrome, type ImportedCv, type ImportedRole } from './types';

/** Bullet markers survive PDF extraction as any of these. */
const BULLET = /^\s*[-*+•‣·▪—–]\s+/;
/** A year, or a range of them, anywhere in the line. */
const DATES =
  /((?:19|20)\d{2}|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*(?:19|20)\d{2})\s*(?:--+|[–—]|-|to|until|–)?\s*((?:19|20)\d{2}|present|current|ongoing|now)?/i;

const KNOWN_SECTION =
  /^(experience|employment|work(?:\s+experience)?|professional\s+experience|education|skills?|languages?|summary|profile|about|objective|projects?|publications?|certifications?|interests|awards|volunteering)\b/i;

/** Headings shout: all caps, or a known word on a short line of its own. */
function isHeading(line: string): boolean {
  const text = plain(line);
  if (!text || text.length > 48 || BULLET.test(line)) return false;
  // "Languages: TypeScript, Go" opens with a section word but is an item —
  // a heading has nothing after the colon.
  if (/:\s*\S/.test(text)) return false;
  if (KNOWN_SECTION.test(text) && text.split(/\s+/).length <= 4) return true;
  const letters = text.replace(/[^a-zA-Z]/g, '');
  return letters.length >= 3 && letters === letters.toUpperCase();
}

/** A job line carries a date range and is not a bullet. */
function looksLikeRole(line: string): boolean {
  return !BULLET.test(line) && DATES.test(line) && plain(line).length <= 120;
}

function splitDates(line: string): { rest: string; dates: string } {
  const m = line.match(DATES);
  if (!m) return { rest: plain(line), dates: '' };
  const from = m[1] ?? '';
  const to = m[2] ?? '';
  const year = (s: string) => s.match(/(?:19|20)\d{2}/)?.[0] ?? s.toLowerCase();
  const dates = to ? `${year(from)}--${year(to)}` : year(from);
  const rest = plain(line.replace(m[0], ' ')).replace(/[,;|·—–-]\s*$/, '');
  return { rest, dates: dates === year(to) && !from ? '' : dates };
}

export function parseTextCv(source: string): ImportedCv {
  const lines = source.split('\n');
  const chrome: ImportedChrome = { ...EMPTY_CHROME, socials: [], sections: [] };
  const roles: ImportedRole[] = [];
  const unplaced: string[] = [];

  // Contact details are written at the top, before any heading.
  const headAt = lines.findIndex(isHeading);
  const head = (headAt === -1 ? lines : lines.slice(0, headAt)).join('\n');
  chrome.email = head.match(EMAIL)?.[0] ?? '';
  for (const { network, re } of SOCIALS) {
    const handle = head.match(re)?.[1];
    if (handle) chrome.socials.push({ network, handle });
  }
  const urls = head.match(new RegExp(URL, 'g')) ?? [];
  chrome.homepage =
    urls.find((u) => !SOCIALS.some(({ re }) => re.test(u)))?.replace(/[.,]$/, '') ?? '';

  // The name is the first line that reads like one: a few words, no contact
  // details, no dates.
  const nameLine = (headAt === -1 ? lines : lines.slice(0, headAt))
    .map(plain)
    .find(
      (l) =>
        l &&
        l.split(/\s+/).length <= 4 &&
        !EMAIL.test(l) &&
        !URL.test(l) &&
        !/\d/.test(l) &&
        !isHeading(l),
    );
  const [firstName = '', ...restName] = (nameLine ?? '').split(/\s+/);
  chrome.firstName = firstName;
  chrome.lastName = restName.join(' ');

  let section = '';
  let current: ImportedRole | null = null;
  const sectionLines = new Map<string, string[]>();

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!plain(line)) continue;

    if (isHeading(line)) {
      section = plain(line);
      current = null;
      continue;
    }

    if (EXPERIENCE.test(section.toLowerCase()) || /experience|employment/i.test(section)) {
      if (looksLikeRole(line)) {
        const { rest, dates } = splitDates(line);
        const parsed = parseRoleHeading(rest);
        current = {
          employer: parsed.employer,
          roleTitle: parsed.roleTitle,
          dates: dates || parsed.dates,
          location: '',
          bullets: [],
        };
        roles.push(current);
        continue;
      }
      const text = plain(line.replace(BULLET, ''));
      // Short unbulleted lines under a job are usually a location or a client
      // name, not an achievement.
      if (current && (BULLET.test(line) || text.length > 40)) current.bullets.push(text);
      else if (!current && (BULLET.test(line) || text.length > 40)) unplaced.push(text);
      continue;
    }

    if (SUMMARY.test(section.toLowerCase())) {
      chrome.summary = `${chrome.summary} ${plain(line)}`.trim();
      continue;
    }

    if (!section) continue;
    const list = sectionLines.get(section) ?? [];
    list.push(line);
    sectionLines.set(section, list);
  }

  for (const [heading, body] of sectionLines) {
    const items = body.map((line) => parseItem(line.replace(BULLET, '- ')));
    if (items.length) chrome.sections.push({ heading, items });
  }

  return { chrome, roles, unplaced };
}
