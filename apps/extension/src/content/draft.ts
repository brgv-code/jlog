// The draft icon — ADR-012 phase 3.
//
// A small jlog mark in the corner of an open-ended question while it has
// focus. Clicking it drafts an answer from the user's profile (pro) and writes
// it into the field, with the facts it used listed underneath. The user edits
// and submits; nothing here submits anything.
//
// One icon for the page, moved to whichever question is focused, and drawn in
// its own shadow root outside the form: nothing is inserted into the board's
// React tree, which would not expect it there.
import { WEB_BASE } from '../lib/connection';
import {
  type DraftResult,
  isDraftable,
  questionOf,
  setTextareaValue,
  sourcesHtml,
} from '../lib/draft';

const HOST_ID = 'jlog-draft';
/** Posting text sent when the application is not saved in jlog yet. */
const MAX_PAGE_TEXT = 20_000;

const STYLE = `
  :host { all: initial; }
  .wrap {
    position: fixed; z-index: 2147483647;
    font: 13px/1.45 ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  }
  .icon {
    all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
    padding: 4px 8px; border-radius: 6px; background: #18181b; color: #fff;
    font-weight: 600; font-size: 12px;
    box-shadow: 0 1px 2px rgb(0 0 0 / .1), 0 2px 8px rgb(0 0 0 / .12);
  }
  .icon:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
  .icon[disabled] { opacity: .6; cursor: default; }
  .panel {
    position: absolute; right: 0; top: calc(100% + 6px); width: 320px;
    padding: 10px 12px; border-radius: 8px; background: #fff; color: #3f3f46;
    border: 1px solid #e4e4e7; box-shadow: 0 4px 16px rgb(0 0 0 / .1);
  }
  .panel[hidden] { display: none; }
  .panel p { margin: 0 0 6px; }
  .panel ul { margin: 4px 0 0; padding-left: 16px; }
  .panel li { margin: 2px 0; }
  .where { color: #71717a; }
  .panel a { color: #2563eb; }
  .close { all: unset; cursor: pointer; float: right; color: #71717a; padding: 0 2px; }
  @media (prefers-color-scheme: dark) {
    .icon { background: #fafafa; color: #18181b; }
    .panel { background: #18181b; color: #d4d4d8; border-color: #3f3f46; }
    .where { color: #a1a1aa; }
    .panel a { color: #60a5fa; }
  }
`;

type Reply = { draft: DraftResult | null; status?: number; code?: string; error?: string };

let host: HTMLDivElement | null = null;
let wrap: HTMLDivElement;
let icon: HTMLButtonElement;
let panel: HTMLDivElement;
let target: HTMLTextAreaElement | null = null;

function build(): void {
  host = document.createElement('div');
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `<style>${STYLE}</style>
    <div class="wrap" hidden>
      <button type="button" class="icon" title="Draft an answer from your jlog profile">jlog · Draft</button>
      <div class="panel" role="status" aria-live="polite" hidden></div>
    </div>`;
  document.documentElement.appendChild(host);
  wrap = shadow.querySelector('.wrap') as HTMLDivElement;
  icon = shadow.querySelector('.icon') as HTMLButtonElement;
  panel = shadow.querySelector('.panel') as HTMLDivElement;
  icon.addEventListener('click', () => void draft());
  panel.addEventListener('click', (e) => {
    if ((e.target as Element).closest('.close')) panel.hidden = true;
  });
}

function place(): void {
  if (!target || !host) return;
  const r = target.getBoundingClientRect();
  // Hidden or scrolled away: no icon floating over something else.
  if (!r.width || r.bottom < 0 || r.top > window.innerHeight) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  wrap.style.top = `${Math.max(0, r.bottom - 30)}px`;
  wrap.style.left = `${Math.max(0, r.right - 96)}px`;
}

function say(html: string): void {
  panel.innerHTML = `<button type="button" class="close" aria-label="Close">×</button>${html}`;
  panel.hidden = false;
}

function explain(reply: Reply): string {
  if (reply.status === 402) {
    return `Drafting answers is part of jlog Pro. <a href="${WEB_BASE}/settings" target="_blank" rel="noopener">See plans</a>`;
  }
  if (reply.status === 401)
    return 'jlog is not connected. Open the jlog extension popup and paste your key.';
  if (reply.code === 'SENSITIVE_QUESTION') {
    return 'jlog does not draft answers to visa, pay, EEO or background questions.';
  }
  if (reply.code === 'LLM_NOT_CONFIGURED') {
    return `Choose an LLM provider first. <a href="${WEB_BASE}/settings" target="_blank" rel="noopener">Open settings</a>`;
  }
  if (reply.code === 'ANSWER_FAILED') {
    return 'Could not write an answer that stays within your profile. Try again, or write this one yourself.';
  }
  return 'Could not reach jlog. Try again in a moment.';
}

async function draft(): Promise<void> {
  const field = target;
  if (!field) return;
  if (field.value.trim()) {
    say('<p>This field already has text. Clear it to draft a new answer.</p>');
    return;
  }
  icon.disabled = true;
  icon.textContent = 'Drafting…';
  try {
    const reply = (await chrome.runtime.sendMessage({
      type: 'DRAFT_ANSWER',
      question: questionOf(field),
      pageUrl: location.href,
      pageText: (document.body.innerText ?? '').slice(0, MAX_PAGE_TEXT),
    })) as Reply;

    if (!reply.draft) {
      say(`<p>${explain(reply)}</p>`);
      return;
    }
    if (reply.draft.status === 'insufficient') {
      const missing = reply.draft.missing.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
      say(
        `<p>Your profile does not cover this one, so jlog did not write it.</p><p>${missing}</p><p><a href="${WEB_BASE}/cv" target="_blank" rel="noopener">Add it to your CV</a></p>`,
      );
      return;
    }
    // Written only if the field is still empty: the user may have started
    // typing while the request was out, and their words win.
    if (field.value.trim()) {
      say('<p>You started typing while the draft was being written, so it was not inserted.</p>');
      return;
    }
    setTextareaValue(field, reply.draft.answer);
    say(
      `<p>Drafted from your profile. Read it before you submit. Based on:</p>${sourcesHtml(reply.draft)}`,
    );
  } catch {
    say('<p>jlog lost its connection to this page. Reload the page and try again.</p>');
  } finally {
    icon.disabled = false;
    icon.textContent = 'jlog · Draft';
  }
}

document.addEventListener('focusin', (e) => {
  const el = e.target as Element;
  // Focus moving into our own icon is retargeted to the host; keep the target.
  if (host && el === host) return;
  if (!isDraftable(el)) {
    target = null;
    if (host) wrap.hidden = true;
    return;
  }
  if (!host) build();
  if (target !== el) panel.hidden = true;
  target = el;
  place();
});

window.addEventListener('scroll', place, { passive: true, capture: true });
window.addEventListener('resize', place, { passive: true });
