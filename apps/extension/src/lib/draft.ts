/**
 * Drafted answers to open-ended application questions (ADR-012 phase 3).
 *
 * The drafting itself is server-side and pro (`POST /api/pro/answer`); this is
 * the part the page needs: which fields get the icon, what question to send,
 * and how to write the draft in so React notices.
 */
import { isSensitive, rawLabelFor } from './autofill';

/** What the API returns, as the content script reads it. */
export type DraftSource = {
  factId: string;
  text: string;
  employer: string | null;
  roleTitle: string | null;
};
export type DraftResult =
  | {
      status: 'drafted';
      answer: string;
      sentences: { text: string; sources: DraftSource[]; jd?: { text: string } }[];
    }
  | { status: 'insufficient'; missing: string };

/** A label shorter than this is a field name ("Notes"), not a question. */
const MIN_QUESTION = 8;

/** The question a field asks, as the board wrote it, without required markers. */
export function questionOf(el: HTMLTextAreaElement): string {
  return rawLabelFor(el).replace(/[*✱]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Whether a field gets the draft icon. Textareas only: a one-line input is a
 * fact, not an essay. Never a sensitive question, whatever it looks like, and
 * never one without a readable question, because there is nothing to answer.
 */
export function isDraftable(el: Element): el is HTMLTextAreaElement {
  if (!(el instanceof HTMLTextAreaElement)) return false;
  if (el.disabled || el.readOnly) return false;
  if (isSensitive(el)) return false;
  return questionOf(el).length >= MIN_QUESTION;
}

/** Write a draft the way a keystroke would, so a React form keeps it. */
export function setTextareaValue(el: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

/**
 * The sources under a draft, one line each, deduplicated: several sentences
 * often cite the same fact. Escaped, because it is the user's own text going
 * into innerHTML.
 */
export function sourcesHtml(result: Extract<DraftResult, { status: 'drafted' }>): string {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const s of result.sentences) {
    for (const src of s.sources) {
      if (seen.has(src.factId)) continue;
      seen.add(src.factId);
      const where = [src.roleTitle, src.employer].filter(Boolean).join(', ');
      items.push(
        `<li>${escapeHtml(src.text)}${where ? ` <span class="where">${escapeHtml(where)}</span>` : ''}</li>`,
      );
    }
    if (s.jd && !seen.has(`jd:${s.jd.text}`)) {
      seen.add(`jd:${s.jd.text}`);
      items.push(`<li>${escapeHtml(s.jd.text)} <span class="where">job posting</span></li>`);
    }
  }
  return `<ul>${items.join('')}</ul>`;
}
