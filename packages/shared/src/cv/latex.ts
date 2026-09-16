/**
 * Read a moderncv-style LaTeX CV into the import shape.
 *
 * This is the round trip of `renderTex`: every command it emits — \name,
 * \social, \cventry, \cvitem — is read back here, so a CV jlog generated can be
 * re-imported without loss. Files written by hand are the same dialect, which
 * is why this door needs no model at all.
 *
 * The group reading, prose conversion and date normalisation are ported from
 * `packages/db/scripts/mine-cv-corpus.mjs`, including the two bugs that corpus
 * import already paid for: only an unescaped `%` opens a comment, and specials
 * are unescaped to the character they stand for before the generic command
 * strip runs. Both are pinned by tests here.
 */
import { EMPTY_CHROME, type ImportedChrome, type ImportedCv, type ImportedRole } from './types';

/** Read the balanced `{...}` group starting at `from`. Returns [content, nextIndex]. */
function readGroup(src: string, from: number): [string | null, number] {
  if (src[from] !== '{') return [null, from];
  let depth = 0;
  const start = from + 1;
  let cursor = from;
  while (cursor < src.length) {
    const ch = src[cursor];
    if (ch === '\\') {
      cursor += 2;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return [src.slice(start, cursor), cursor + 1];
    }
    cursor++;
  }
  return [null, cursor];
}

/** Skip `[...]` optional arguments and the whitespace around them. */
function skipOptional(src: string, from: number): number {
  let cursor = from;
  for (;;) {
    while (cursor < src.length && /\s/.test(src[cursor] ?? '')) cursor++;
    if (src[cursor] !== '[') return cursor;
    const close = src.indexOf(']', cursor);
    if (close === -1) return cursor;
    cursor = close + 1;
  }
}

/** Read `n` consecutive brace groups, tolerating optional args between them. */
function readGroups(src: string, from: number, n: number): [string[], number] {
  const out: string[] = [];
  let cursor = from;
  for (let k = 0; k < n; k++) {
    cursor = skipOptional(src, cursor);
    const [group, next] = readGroup(src, cursor);
    if (group === null) return [out, cursor];
    out.push(group);
    cursor = next;
  }
  return [out, cursor];
}

/** Strip LaTeX markup down to the prose a human would read. */
export function toProse(latex: string): string {
  return (
    latex
      // Only an unescaped % opens a comment. `\%` is data, and stripping it
      // turned "reducing manual effort by 60\%" into "...by 60\".
      .replace(/(^|[^\\])%.*$/gm, '$1')
      .replace(/\\href\{[^}]*\}\{([^}]*)\}/g, '$1')
      .replace(/\\(emph|textbf|textit|texttt|underline)\{([^}]*)\}/g, '$2')
      // Unescape specials before the generic command strip, which would
      // otherwise delete the % from every percentage.
      .replace(/\\([&%$#_])/g, '$1')
      .replace(/\\[a-zA-Z@]+\s*(\[[^\]]*\])?/g, ' ')
      .replace(/[{}]/g, ' ')
      .replace(/~/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Reduce a date range to years. One job gets written "Jun 2017 -- Oct 2021",
 * "2017 -- 2021" and "2017--2021"; storing all three splits one role three ways.
 */
export function normaliseDates(raw: string): string {
  if (!raw) return raw;
  const parts = raw.split(/\s*(?:--+|[–—]|\s-\s|\bto\b)\s*/).filter(Boolean);
  const side = (s: string) => {
    const year = s.match(/\b(?:19|20)\d{2}\b/);
    if (year) return year[0];
    const open = s.match(/current|present|ongoing|now/i);
    return open ? open[0].toLowerCase() : s.trim();
  };
  const ends = parts.map(side);
  if (ends.length < 2) return ends[0] ?? raw;
  const from = ends[0] ?? '';
  const to = ends[ends.length - 1] ?? '';
  return from === to ? from : `${from}--${to}`;
}

/** First argument of a single-group command, as prose. */
function readCommand(src: string, command: string): string {
  const at = src.indexOf(`\\${command}`);
  if (at === -1) return '';
  const [groups] = readGroups(src, at + command.length + 1, 1);
  return groups[0] ? toProse(groups[0]) : '';
}

function readChrome(src: string): ImportedChrome {
  const chrome: ImportedChrome = { ...EMPTY_CHROME, socials: [], sections: [] };

  const nameAt = src.indexOf('\\name');
  if (nameAt !== -1) {
    const [groups] = readGroups(src, nameAt + 5, 2);
    chrome.firstName = toProse(groups[0] ?? '');
    chrome.lastName = toProse(groups[1] ?? '');
  }

  chrome.title = readCommand(src, 'title');
  chrome.address = readCommand(src, 'address');
  chrome.email = readCommand(src, 'email');
  chrome.homepage = readCommand(src, 'homepage');
  // The photo argument is a filename shipped alongside the compile, not prose.
  const photo = src.match(/\\photo(?:\[[^\]]*\])*\{([^}]*)\}/);
  chrome.photo = photo?.[1]?.trim() ?? '';

  const socialRe = /\\social\[([^\]]*)\]\{([^}]*)\}/g;
  let s = socialRe.exec(src);
  while (s !== null) {
    chrome.socials.push({ network: toProse(s[1] ?? ''), handle: toProse(s[2] ?? '') });
    s = socialRe.exec(src);
  }

  return chrome;
}

/** `\section{X}` headings with the body that follows each one. */
function readSections(src: string): { heading: string; body: string }[] {
  const out: { heading: string; body: string }[] = [];
  const re = /\\section\{([^}]*)\}/g;
  // Both offsets: a body starts after its own command and ends where the next
  // command starts, not where the next body does — otherwise every section
  // swallows the following heading's title.
  const heads: { heading: string; start: number; at: number }[] = [];
  let m = re.exec(src);
  while (m !== null) {
    heads.push({ heading: toProse(m[1] ?? ''), start: m.index, at: m.index + m[0].length });
    m = re.exec(src);
  }
  heads.forEach((h, i) => {
    const end = i + 1 < heads.length ? (heads[i + 1]?.start ?? src.length) : src.length;
    const body = src.slice(h.at, end).replace(/\\end\{document\}[\s\S]*$/, '');
    out.push({ heading: h.heading, body });
  });
  return out;
}

/** `\item` bodies inside one `\cventry` body, in order. */
function readItems(rawBody: string): string[] {
  const positions: number[] = [];
  const re = /\\item\b/g;
  let m = re.exec(rawBody);
  while (m !== null) {
    positions.push(m.index);
    m = re.exec(rawBody);
  }
  return positions
    .map((pos, i) => {
      const end = i + 1 < positions.length ? (positions[i + 1] ?? rawBody.length) : rawBody.length;
      return toProse(rawBody.slice(pos + 5, end).replace(/\\end\{itemize\}[\s\S]*$/, ''));
    })
    .filter(Boolean);
}

export function parseLatexCv(source: string): ImportedCv {
  const chrome = readChrome(source);
  const roles: ImportedRole[] = [];

  const entryRe = /\\cventry\b/g;
  let m = entryRe.exec(source);
  while (m !== null) {
    // Advance before any branch can `continue`, or a skipped entry loops
    // forever on the same match.
    const at = m.index + m[0].length;
    m = entryRe.exec(source);
    const [groups] = readGroups(source, at, 6);
    if (groups.length < 6) continue;
    const [rawDates, roleTitle, employer, location] = groups.map((g) => toProse(g));
    roles.push({
      employer: employer || '',
      roleTitle: roleTitle || '',
      dates: normaliseDates(rawDates ?? ''),
      location: location || '',
      bullets: readItems(groups[5] ?? ''),
    });
  }

  for (const section of readSections(source)) {
    if (/^summary$/i.test(section.heading)) {
      chrome.summary = toProse(section.body);
      continue;
    }
    // A section is Experience if the entries live in it; those are roles, and
    // they are already read above.
    if (section.body.includes('\\cventry')) continue;

    const items: { left: string; right: string }[] = [];
    const itemRe = /\\cvitem\b/g;
    let im = itemRe.exec(section.body);
    while (im !== null) {
      const at = im.index + im[0].length;
      im = itemRe.exec(section.body);
      const [pair] = readGroups(section.body, at, 2);
      if (pair.length < 2) continue;
      items.push({ left: toProse(pair[0] ?? ''), right: toProse(pair[1] ?? '') });
    }
    if (items.length) chrome.sections.push({ heading: section.heading, items });
  }

  return { chrome, roles, unplaced: [] };
}
