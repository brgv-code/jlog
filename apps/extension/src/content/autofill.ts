// Autofill content script — ADR-012 phase 1.
//
// Puts one "Fill with jlog" button on an application form. Clicking it fills
// the standard fields from the user's CV profile and says what it left. It
// never submits: the user reads the form and presses submit themselves.
//
// Runs in every frame on Greenhouse, Lever and Ashby, because company career
// sites embed those forms in an iframe and the form is only reachable from
// inside it.
import {
  type CvProfile,
  type SavedValues,
  countStandardFields,
  fillForm,
  summarise,
  valuesFromProfile,
} from '../lib/autofill';
import { WEB_BASE } from '../lib/connection';
// The draft icon on open-ended questions (phase 3) runs in the same frames.
import './draft';

const HOST_ID = 'jlog-autofill';
/** Below this many recognisable fields the page is a posting, not a form. */
const MIN_FIELDS = 2;

const STYLE = `
  :host { all: initial; }
  .box {
    position: fixed; right: 20px; bottom: 20px; z-index: 2147483647;
    display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
    font: 13px/1.4 ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  }
  button {
    all: unset; cursor: pointer; padding: 9px 14px; border-radius: 8px;
    background: #18181b; color: #fff; font-weight: 600;
    box-shadow: 0 1px 2px rgb(0 0 0 / .08), 0 4px 16px rgb(0 0 0 / .12);
  }
  button:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
  button[disabled] { opacity: .6; cursor: default; }
  .note {
    max-width: 280px; padding: 10px 12px; border-radius: 8px;
    background: #fff; color: #3f3f46; border: 1px solid #e4e4e7;
    box-shadow: 0 4px 16px rgb(0 0 0 / .08);
  }
  .note a { color: #2563eb; }
  .note[hidden] { display: none; }
  @media (prefers-color-scheme: dark) {
    button { background: #fafafa; color: #18181b; }
    .note { background: #18181b; color: #d4d4d8; border-color: #3f3f46; }
    .note a { color: #60a5fa; }
  }
`;

/** Filled fields get a soft accent ring until the user edits them. */
function mark(root: ParentNode): void {
  for (const el of Array.from(root.querySelectorAll<HTMLInputElement>('input[data-jlog-filled]'))) {
    if (el.dataset.jlogMarked) continue;
    el.dataset.jlogMarked = '1';
    el.style.boxShadow = '0 0 0 2px rgb(37 99 235 / .35)';
    // Our own fill fires `input` too; only a real keystroke clears the ring.
    el.addEventListener('input', (e) => {
      if (e.isTrusted) el.style.boxShadow = '';
    });
  }
}

function inject(): void {
  if (document.getElementById(HOST_ID)) return;

  const host = document.createElement('div');
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `<style>${STYLE}</style>
    <div class="box">
      <div class="note" role="status" aria-live="polite" hidden></div>
      <button type="button">Fill with jlog</button>
    </div>`;
  document.documentElement.appendChild(host);

  const button = shadow.querySelector('button') as HTMLButtonElement;
  const note = shadow.querySelector('.note') as HTMLDivElement;

  const say = (html: string) => {
    note.innerHTML = html;
    note.hidden = false;
  };

  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const res = (await chrome.runtime.sendMessage({ type: 'AUTOFILL_PROFILE' })) as {
        profile: CvProfile | null;
        saved: SavedValues | null;
        status?: number;
        error?: string;
      };
      if (res.status === 401) {
        say('jlog is not connected. Open the jlog extension popup and paste your key.');
        return;
      }
      if (res.error) {
        say('Could not reach jlog. Try again in a moment.');
        return;
      }
      if (!res.profile) {
        say(
          `Your jlog profile is empty. <a href="${WEB_BASE}/cv" target="_blank" rel="noopener">Add your CV</a> first.`,
        );
        return;
      }
      const report = fillForm(valuesFromProfile(res.profile, res.saved));
      mark(document);
      say(summarise(report));
    } catch {
      // The usual cause: the extension was updated or reloaded while this tab
      // stayed open, which cuts the page off from it until a reload.
      say('jlog lost its connection to this page. Reload the page and try again.');
    } finally {
      button.disabled = false;
    }
  });
}

let pending: number | undefined;
// Boards render the form after load, so this re-checks on DOM changes, at most
// twice a second, and stops for good once the button is on the page.
const observer = new MutationObserver(check);
function check(): void {
  if (pending !== undefined) return;
  pending = window.setTimeout(() => {
    pending = undefined;
    if (countStandardFields() < MIN_FIELDS) return;
    inject();
    observer.disconnect();
  }, 500);
}

check();
observer.observe(document.documentElement, { childList: true, subtree: true });
