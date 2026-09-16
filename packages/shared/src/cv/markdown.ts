import { normaliseDates } from './latex';
/**
 * Read a Markdown CV into the import shape.
 *
 * Markdown has no CV grammar, so this reads the convention people actually
 * write: a name as the top heading, contact details loose in the lines under
 * it, `## Experience` holding one sub-heading per job, and bullets beneath.
 * Anything it cannot place is returned in `unplaced` rather than dropped —
 * review is where a human decides, and a silently discarded bullet looks
 * exactly like one the CV never had.
 */
import { EMPTY_CHROME, type ImportedChrome, type ImportedCv, type ImportedRole } from './types';

export const EXPERIENCE = /^(experience|employment|work|work experience|professional experience)$/i;
export const SUMMARY = /^(summary|profile|about|objective)$/i;

export const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
export const URL = /\bhttps?:\/\/[^\s)|,]+|\b(?:www\.)[^\s)|,]+/;

export const SOCIALS = [
  { network: 'linkedin', re: /linkedin\.com\/in\/([\w-]+)/i },
  { network: 'github', re: /github\.com\/([\w-]+)/i },
  { network: 'twitter', re: /(?:twitter|x)\.com\/([\w-]+)/i },
];

type Block = { heading: string; level: number; lines: string[] };

/** Split into heading-led blocks, keeping anything before the first heading. */
function blocks(md: string): Block[] {
  const out: Block[] = [{ heading: '', level: 0, lines: [] }];
  for (const line of md.split('\n')) {
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) out.push({ heading: (h[2] ?? '').trim(), level: (h[1] ?? '').length, lines: [] });
    else out[out.length - 1]?.lines.push(line);
  }
  return out;
}

export const isBullet = (line: string) => /^\s*[-*+]\s+/.test(line);
export const bulletText = (line: string) => line.replace(/^\s*[-*+]\s+/, '').trim();
/** Markdown emphasis and links carry no meaning once the text is a stored fact. */
export const plain = (s: string) =>
  s
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * "Staff Engineer — Acme (2020–2024)", "Acme | Staff Engineer | 2020-2024",
 * "Staff Engineer at Acme, 2020". The date is whatever trails; of the two
 * remaining parts the one naming a seniority word is the title, else the first
 * is taken as the title — which is what review is for.
 */
export function parseRoleHeading(raw: string): {
  employer: string;
  roleTitle: string;
  dates: string;
} {
  let rest = plain(raw);
  let dates = '';

  const parens = rest.match(/\(([^)]*\d{4}[^)]*)\)\s*$/);
  if (parens) {
    dates = parens[1] ?? '';
    rest = rest.slice(0, parens.index).trim();
  }

  const parts = rest
    .split(/\s+[—–|·]\s+|\s+-\s+|\s+@\s+|\s+at\s+|,\s*/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (!dates) {
    // The separator split also breaks "2021 - present" apart, so collect every
    // trailing date-ish part rather than just the last one.
    const tail: string[] = [];
    while (
      parts.length > 1 &&
      /^[^a-z]*(?:\d{4}|present|current|ongoing|now)[^a-z]*$/i.test(parts[parts.length - 1] ?? '')
    ) {
      tail.unshift(parts.pop() ?? '');
    }
    dates = tail.join('--');
  }

  const TITLE =
    /engineer|developer|manager|designer|lead|head|director|founder|analyst|scientist|consultant|intern|architect|officer|president|cto|ceo|vp/i;
  if (parts.length >= 2) {
    const titleAt = parts.findIndex((p) => TITLE.test(p));
    const ti = titleAt === -1 ? 0 : titleAt;
    const roleTitle = parts[ti] ?? '';
    const employer = (parts.filter((_, i) => i !== ti)[0] ?? '').trim();
    return { employer, roleTitle, dates: normaliseDates(dates) };
  }
  return { employer: parts[0] ?? '', roleTitle: '', dates: normaliseDates(dates) };
}

/** "Languages: German, English" and "**Languages** — German" both split in two. */
export function parseItem(line: string): { left: string; right: string } {
  const text = plain(bulletText(line));
  const split = text.match(/^([^:—–|]{1,40})\s*[:—–|]\s*(.+)$/);
  return split
    ? { left: (split[1] ?? '').trim(), right: (split[2] ?? '').trim() }
    : { left: '', right: text };
}

function readChrome(preamble: Block, nameHeading: string): ImportedChrome {
  const chrome: ImportedChrome = { ...EMPTY_CHROME, socials: [], sections: [] };
  const [firstName = '', ...rest] = plain(nameHeading).split(/\s+/);
  chrome.firstName = firstName;
  chrome.lastName = rest.join(' ');

  const text = preamble.lines.join('\n');
  chrome.email = text.match(EMAIL)?.[0] ?? '';
  for (const { network, re } of SOCIALS) {
    const handle = text.match(re)?.[1];
    if (handle) chrome.socials.push({ network, handle });
  }
  // A homepage is a URL that is not one of the socials already claimed.
  const urls = text.match(new RegExp(URL, 'g')) ?? [];
  chrome.homepage =
    urls.find((u) => !SOCIALS.some(({ re }) => re.test(u)))?.replace(/[.,]$/, '') ?? '';

  // The first non-empty line that is not contact details reads as a headline.
  const headline = preamble.lines
    .map(plain)
    .find((l) => l && !EMAIL.test(l) && !URL.test(l) && l.length < 80);
  chrome.title = headline ?? '';

  return chrome;
}

export function parseMarkdownCv(source: string): ImportedCv {
  const parsed = blocks(source);
  const preamble = parsed[0] ?? { heading: '', level: 0, lines: [] };
  const headings = parsed.slice(1);
  const nameBlock = headings[0];

  // A leading `# Name` is the name; without one the preamble's first line is.
  const nameHeading =
    nameBlock && nameBlock.level === 1 && !EXPERIENCE.test(nameBlock.heading)
      ? nameBlock.heading
      : (preamble.lines.map(plain).find(Boolean) ?? '');
  const chrome = readChrome(preamble, nameHeading);

  const roles: ImportedRole[] = [];
  const unplaced: string[] = [];
  let inExperience = false;
  let sectionLevel = nameBlock?.level === 1 ? 2 : 1;

  for (const block of headings) {
    if (block === nameBlock && block.level === 1) {
      // The name's own block can still carry contact lines.
      const extra = readChrome(block, nameHeading);
      chrome.email ||= extra.email;
      chrome.homepage ||= extra.homepage;
      chrome.title ||= extra.title;
      if (!chrome.socials.length) chrome.socials = extra.socials;
      continue;
    }

    if (SUMMARY.test(block.heading)) {
      chrome.summary = plain(block.lines.join(' '));
      inExperience = false;
      continue;
    }

    if (EXPERIENCE.test(block.heading)) {
      inExperience = true;
      sectionLevel = block.level;
      continue;
    }

    // A heading at the same level as Experience ends it; anything deeper is a
    // job inside it.
    if (inExperience && block.level > sectionLevel) {
      const { employer, roleTitle, dates } = parseRoleHeading(block.heading);
      const bullets = block.lines.filter(isBullet).map((l) => plain(bulletText(l)));
      const prose = block.lines
        .filter((l) => !isBullet(l) && plain(l))
        .map(plain)
        .filter((l) => l.length > 40);
      roles.push({
        employer,
        roleTitle,
        dates,
        location: '',
        bullets: [...bullets, ...prose],
      });
      continue;
    }

    inExperience = false;
    const items = block.lines.filter(isBullet).map(parseItem);
    const loose = block.lines.filter((l) => !isBullet(l) && plain(l)).map(plain);
    if (items.length) chrome.sections.push({ heading: block.heading, items });
    else if (loose.length)
      chrome.sections.push({
        heading: block.heading,
        items: loose.map((right) => ({ left: '', right })),
      });
  }

  // Bullets written before any heading have no role to hang off.
  unplaced.push(...preamble.lines.filter(isBullet).map((l) => plain(bulletText(l))));

  return { chrome, roles, unplaced };
}
