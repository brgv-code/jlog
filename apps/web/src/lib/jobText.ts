/**
 * Structure inference for scraped job descriptions.
 *
 * Postings arrive from the extension as plain text: the markup that made them
 * readable on the job board is gone, so headings, bullets and paragraphs all
 * come through as undifferentiated lines. Rendering that through the markdown
 * renderer produces a wall of text, because there is no markdown in it.
 *
 * This puts the structure back by inference. It is heuristic and will sometimes
 * be wrong, which is why the detail view keeps a toggle back to the original —
 * a formatter you cannot see through is worse than no formatter.
 */

const BULLET = /^\s*[•●▪‣◦·*+–—-]\s+(.*)$/;
const NUMBERED = /^\s*\(?(\d+)[.)]\s+(.*)$/;
/** Horizontal rules and the runs of dashes some boards use as separators. */
const SEPARATOR = /^\s*([-=_*•·]\s*){3,}$/;
/** Already-markdown headings, which need no guessing. */
const ATX_HEADING = /^\s{0,3}#{1,6}\s+\S/;

/** Sentence-ending punctuation: a line ending here is a finished thought. */
const TERMINAL = /[.!?:;,]["')\]]?$/;

const MAX_HEADING_LENGTH = 72;

/**
 * Text that already carries its own structure is left alone. Running inference
 * over real markdown would compete with it — a line ending in a colon inside a
 * markdown document is usually a sentence, not a heading.
 */
export function looksLikeMarkdown(text: string): boolean {
  const lines = text.split('\n');
  const headings = lines.filter((l) => ATX_HEADING.test(l)).length;
  if (headings >= 2) return true;
  // A handful of "- " bullets is how a person writes markdown; a scraped
  // posting uses the typographic glyphs instead.
  const dashBullets = lines.filter((l) => /^\s*[-*]\s+\S/.test(l)).length;
  return headings >= 1 && dashBullets >= 2;
}

function isAllCaps(s: string): boolean {
  const letters = s.replace(/[^A-Za-z]/g, '');
  return letters.length >= 2 && letters === letters.toUpperCase();
}

/**
 * Title Case in the loose sense a job board uses: most words capitalised, and
 * not a sentence. "What You Will Do" qualifies; "We are looking for" does not.
 */
function isTitleCase(s: string): boolean {
  const words = s.split(/\s+/).filter((w) => /[A-Za-z]/.test(w));
  if (words.length === 0 || words.length > 8) return false;
  const capitalised = words.filter((w) => /^[A-Z]/.test(w)).length;
  return capitalised / words.length >= 0.6;
}

type Line =
  | { kind: 'blank' }
  | { kind: 'bullet'; text: string }
  | { kind: 'numbered'; text: string }
  | { kind: 'text'; text: string };

function classify(raw: string): Line {
  const line = raw.trim();
  if (line === '' || SEPARATOR.test(line)) return { kind: 'blank' };
  const numbered = NUMBERED.exec(line);
  if (numbered) return { kind: 'numbered', text: (numbered[2] ?? '').trim() };
  const bullet = BULLET.exec(line);
  if (bullet) return { kind: 'bullet', text: (bullet[1] ?? '').trim() };
  return { kind: 'text', text: line };
}

/**
 * A heading is short, unpunctuated, and introduces something — either it is
 * shouted, or title-cased, or the thing directly under it is a list.
 */
function isHeading(text: string, next: Line | undefined, prev: Line | undefined): boolean {
  if (text.length > MAX_HEADING_LENGTH) return false;
  if (/^https?:\/\//i.test(text)) return false;

  const endsWithColon = text.endsWith(':');
  const body = endsWithColon ? text.slice(0, -1).trim() : text;
  if (body.length === 0) return false;
  // A colon is the strongest signal a board gives, and the only one allowed to
  // override the "no terminal punctuation" rule.
  if (!endsWithColon && TERMINAL.test(text)) return false;

  const introducesList = next?.kind === 'bullet' || next?.kind === 'numbered';
  const standalone = (prev === undefined || prev.kind === 'blank') && next?.kind === 'blank';

  if (endsWithColon && (introducesList || standalone || body.length <= 40)) return true;
  if (isAllCaps(body)) return true;
  if (introducesList && body.length <= 56) return true;
  /*
   * A short line alone between two blank lines, with no terminal punctuation
   * and starting capitalised, is a heading. Requiring Title Case here missed
   * the sentence-case headings boards actually use — "About the role" has one
   * capital in three words. The cost of a false positive is a line rendered
   * bold; the cost of a false negative is the wall of text this exists to fix.
   */
  if (standalone && body.length <= 56 && /^[A-Z]/.test(body)) return true;
  if (isTitleCase(body) && introducesList) return true;
  return false;
}

/**
 * Turn a scraped posting into markdown.
 *
 * Consecutive prose lines are rejoined into one paragraph unless the earlier
 * line ends a sentence — boards hard-wrap mid-sentence, and leaving those wraps
 * in produces a column of orphaned fragments rather than prose.
 */
export function inferStructure(text: string): string {
  if (text.trim() === '') return '';
  if (looksLikeMarkdown(text)) return text;

  const lines = text.replace(/\r\n?/g, '\n').split('\n').map(classify);
  const out: string[] = [];
  let paragraph: string[] = [];

  function flush() {
    if (paragraph.length > 0) {
      out.push(paragraph.join(' '), '');
      paragraph = [];
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const next = lines[i + 1];
    const prev = lines[i - 1];

    if (line.kind === 'blank') {
      flush();
      continue;
    }

    if (line.kind === 'bullet' || line.kind === 'numbered') {
      flush();
      out.push(line.kind === 'bullet' ? `- ${line.text}` : `1. ${line.text}`);
      // A list runs until something that is not a list item; the blank line
      // after it is emitted by whatever comes next.
      if (next && next.kind !== 'bullet' && next.kind !== 'numbered') out.push('');
      continue;
    }

    if (isHeading(line.text, next, prev)) {
      flush();
      out.push(`## ${line.text.replace(/:$/, '')}`, '');
      continue;
    }

    paragraph.push(line.text);
    // Sentence finished and the next line starts a new one: end the paragraph
    // rather than running two thoughts together.
    if (TERMINAL.test(line.text) && next?.kind === 'text') flush();
  }

  flush();
  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
