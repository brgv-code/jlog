import {
  type Connection,
  DASHBOARD_URL,
  RENEW_WARNING_MS,
  SETTINGS_URL,
  clearToken,
  describeExpiry,
  formatDate,
  getCachedConnection,
  getToken,
  setToken,
} from '../lib/connection';
import { matchSiteExtractor } from '../lib/domExtractors';
import type { DetectedJob, ExtractedJob, RecentActivity } from '../types';

/**
 * Bumped every time a person causes a render. The connection check runs in the
 * background after the popup has already drawn something, and it must never
 * yank the view out from under someone who has started filling in a form — so
 * it only redraws if the epoch it captured is still the current one.
 */
let viewEpoch = 0;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else el.setAttribute(k, v);
  }
  for (const child of children) {
    if (typeof child === 'string') el.appendChild(document.createTextNode(child));
    else el.appendChild(child);
  }
  return el;
}

function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function sendMessageOnce(msg: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (response: unknown) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * Chrome shuts the background service worker down when it is idle and restarts
 * it on the next message. If the popup happens to open during that restart the
 * very first message loses the race and comes back "Could not establish
 * connection" — which is the popup that "just fails until you reload it". One
 * short retry is enough to cover the restart.
 */
async function sendMessage(msg: unknown): Promise<unknown> {
  try {
    return await sendMessageOnce(msg);
  } catch (err) {
    const message = String(err);
    if (!message.includes('Could not establish connection') && !message.includes('port closed')) {
      throw err;
    }
    await new Promise((r) => setTimeout(r, 250));
    return sendMessageOnce(msg);
  }
}

/**
 * Pages the extension is forbidden to read: Chrome's own UI, the web store, and
 * other extensions. Scripting these throws a bare permissions error, so it is
 * worth saying plainly that the page is off-limits rather than letting it look
 * like the extraction failed.
 */
function isRestrictedPage(url: string): boolean {
  return (
    /^(chrome|edge|about|devtools|chrome-extension|view-source):/i.test(url) ||
    /^https:\/\/chromewebstore\.google\.com\//i.test(url) ||
    /^https:\/\/chrome\.google\.com\/webstore/i.test(url)
  );
}

function isJobPage(url: string): boolean {
  const jobPatterns = [
    /linkedin\.com\/jobs/i,
    /wellfound\.com\/jobs/i,
    /ashbyhq\.com\/jobs/i,
    /greenhouse\.io\/jobs/i,
    /lever\.co\//i,
    /jobs?\./i,
    /\/careers?\//i,
    /\/job\//i,
    /\/posting\//i,
  ];
  return jobPatterns.some((p) => p.test(url));
}

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

function renderSpinner(root: HTMLElement): void {
  clear(root);
  const wrap = h('div', { class: 'spinner-wrap' }, h('div', { class: 'spinner' }));
  root.appendChild(wrap);
}

function renderToast(container: HTMLElement, type: 'success' | 'error', message: string): void {
  const icon = type === 'success' ? '✓' : '✗';
  const toast = h('div', { class: `toast toast-${type}` }, `${icon} ${message}`);
  container.insertBefore(toast, container.firstChild);
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 4000);
}

function renderJobCard(
  parent: HTMLElement,
  job: { company: string; role: string; location?: string | null },
): void {
  const card = h(
    'div',
    { class: 'job-card' },
    h('div', { class: 'job-company' }, job.company),
    h('div', { class: 'job-role' }, job.role),
  );
  if (job.location) {
    card.appendChild(h('div', { class: 'job-location' }, job.location));
  }
  parent.appendChild(card);
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

/**
 * The status line in the header: one glance at whether the extension is
 * actually usable, and how long for. The old popup showed nothing here, which
 * is why an expired key was invisible until something failed.
 */
function renderStatus(conn: Connection | null): void {
  const el = document.getElementById('status');
  if (!el) return;
  clear(el);
  el.className = 'status';
  if (!conn || conn.status === 'no-key') return;

  if (conn.status === 'active') {
    const soon = conn.expiresAt !== null && conn.expiresAt - Date.now() < RENEW_WARNING_MS;
    if (soon) el.className = 'status status-warn';
    el.appendChild(h('span', { class: 'status-dot' }));
    el.appendChild(document.createTextNode(describeExpiry(conn.expiresAt)));
    return;
  }

  el.className = 'status status-bad';
  el.appendChild(h('span', { class: 'status-dot' }));
  el.appendChild(document.createTextNode(conn.status === 'offline' ? 'offline' : 'not connected'));
}

function openSettings(): void {
  void chrome.tabs.create({ url: SETTINGS_URL });
}

/**
 * The one screen for "you cannot use this yet", whatever the reason. Keeping
 * the paste box on the same screen as the explanation means an expired key is
 * two clicks from fixed — copy in Settings, paste here — instead of a dead end
 * that says "session expired" and makes you find the form yourself.
 */
function renderConnect(root: HTMLElement, conn: Connection | null): void {
  viewEpoch += 1;
  clear(root);

  const status = conn?.status ?? 'no-key';

  if (status === 'expired') {
    root.appendChild(h('div', { class: 'headline' }, 'Your jlog key expired'));
    const when = conn?.expiresAt != null ? ` It ran out on ${formatDate(conn.expiresAt)}.` : '';
    root.appendChild(
      h(
        'p',
        { class: 'body-text' },
        `Nothing was lost — the key just reached its expiry date.${when} Generate a new one in Settings and paste it below. You can now choose a longer lifetime, or no expiry at all.`,
      ),
    );
  } else if (status === 'rejected') {
    root.appendChild(h('div', { class: 'headline' }, 'This key is no longer valid'));
    root.appendChild(
      h(
        'p',
        { class: 'body-text' },
        'jlog does not recognise it. It was most likely revoked in Settings, or it belongs to a different account. Generate a new one and paste it below.',
      ),
    );
  } else if (status === 'offline') {
    root.appendChild(h('div', { class: 'headline' }, "Can't reach jlog"));
    root.appendChild(
      h(
        'p',
        { class: 'body-text' },
        'Your key may well be fine — the server just did not answer. Check your connection and try again.',
      ),
    );
    const retryBtn = h('button', { class: 'btn btn-primary', type: 'button' }, 'Try again');
    retryBtn.addEventListener('click', () => init());
    root.appendChild(retryBtn);
    return;
  } else {
    root.appendChild(h('div', { class: 'headline' }, 'Connect the extension'));
    root.appendChild(
      h(
        'p',
        { class: 'body-text' },
        'Generate a key in jlog Settings and paste it here. It links this browser to your account so jobs you track land in your dashboard.',
      ),
    );
  }

  const input = h('input', {
    class: 'input monospace gap',
    type: 'text',
    placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    id: 'token-input',
  }) as HTMLInputElement;

  const error = h('p', { class: 'warning error-text', style: 'display:none' });

  const saveBtn = h('button', { class: 'btn btn-primary', type: 'button' }, 'Connect');

  async function submit(): Promise<void> {
    const val = input.value.trim();
    if (!val) return;
    saveBtn.setAttribute('disabled', 'true');
    error.style.display = 'none';
    await setToken(val);

    // Verified before the popup claims success. Pasting a typo used to look
    // like it worked, and only failed later on the first real request.
    const checked = await checkConnectionViaBackground();
    renderStatus(checked);
    if (checked.status === 'active') {
      renderConnected(root, checked);
      return;
    }
    saveBtn.removeAttribute('disabled');
    error.textContent =
      checked.status === 'offline'
        ? "Couldn't reach jlog to check that key. Try again in a moment."
        : 'jlog rejected that key. Copy it again from Settings — it is only shown once.';
    error.style.display = 'block';
  }

  saveBtn.addEventListener('click', () => void submit());
  input.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') void submit();
  });

  const settingsBtn = h(
    'button',
    { class: 'btn btn-secondary', type: 'button', style: 'margin-top:8px' },
    'Open jlog Settings',
  );
  settingsBtn.addEventListener('click', openSettings);

  root.appendChild(input);
  root.appendChild(saveBtn);
  root.appendChild(error);
  root.appendChild(settingsBtn);

  if (status !== 'no-key') {
    const forget = h('button', { class: 'link', style: 'margin-top:10px' }, 'Forget this key');
    forget.addEventListener('click', async () => {
      await clearToken();
      init();
    });
    root.appendChild(forget);
  }

  input.focus();
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Same as `h`, in the SVG namespace — `createElement` would silently not draw. */
function s(tag: string, attrs: Record<string, string> = {}, ...children: Element[]): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const child of children) el.appendChild(child);
  return el;
}

/**
 * The jlog mark, at the geometry in `icons-src/icon.svg`, with the dot and the
 * hook as separate elements so the dot can be animated off the top of the j.
 * That separation is the whole trick behind the hat tip.
 */
function buildTipMark(): SVGElement {
  return s(
    'svg',
    { class: 'tip-mark', viewBox: '0 0 42 42', 'aria-hidden': 'true' },
    s('rect', { width: '32', height: '32', rx: '7', fill: '#18181b' }),
    s('circle', { class: 'tip-dot', cx: '20', cy: '6.5', r: '2.2', fill: '#2563eb' }),
    s('path', {
      d: 'M20 12.5 V19.5 A4.25 4.25 0 0 1 11.5 19.5',
      fill: 'none',
      stroke: '#ffffff',
      'stroke-width': '4',
      'stroke-linecap': 'round',
    }),
    // The confirmation badge, punched out of the tile with a ring of page
    // background so it reads as sitting on top rather than inside the logo.
    s('circle', { cx: '31', cy: '31', r: '9.5', style: 'fill: var(--bg)' }),
    s('circle', { cx: '31', cy: '31', r: '7.5', fill: '#16A34A' }),
    s('path', {
      class: 'tip-check',
      d: 'M27.4 31.1 l2.5 2.5 l4.4 -4.8',
      fill: 'none',
      stroke: '#ffffff',
      'stroke-width': '2.3',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    }),
  );
}

/** How long the confirmation holds before the normal screen takes over. */
const CONNECTED_HOLD_MS = 1900;

/**
 * The moment a key is accepted.
 *
 * Pasting a good key used to be silent: the paste screen simply became the
 * tracking screen, and the one thing the user was waiting to hear — that it
 * worked — was never actually said. This says it, names the account so someone
 * with a work and a personal login knows which one they just wired up, and then
 * gets out of the way on its own.
 */
function renderConnected(root: HTMLElement, conn: Connection): void {
  viewEpoch += 1;
  const epoch = viewEpoch;
  clear(root);

  const wrap = h('div', { class: 'success-wrap' });
  wrap.appendChild(buildTipMark() as unknown as Node);
  wrap.appendChild(h('div', { class: 'success-headline' }, 'Connected'));
  wrap.appendChild(
    h(
      'div',
      { class: 'success-account' },
      conn.account?.email ?? 'This browser is now linked to your jlog account.',
    ),
  );
  root.appendChild(wrap);

  setTimeout(() => {
    // Nothing on this screen is clickable, but a late connection re-check can
    // still have moved things on; do not redraw over a newer view.
    if (viewEpoch !== epoch) return;
    renderForTab(root, conn);
  }, CONNECTED_HOLD_MS);
}

/** Asks the background to verify the stored key. Never throws. */
async function checkConnectionViaBackground(): Promise<Connection> {
  try {
    const resp = (await sendMessage({ type: 'CHECK_CONNECTION' })) as {
      connection?: Connection;
    };
    if (resp?.connection) return resp.connection;
  } catch {
    // Falls through to the offline answer below.
  }
  return { status: 'offline', expiresAt: null, label: null, account: null, checkedAt: Date.now() };
}

/** The sites the content scripts capture from without anyone clicking anything. */
const AUTO_CAPTURE_SITES = [
  'LinkedIn',
  'Greenhouse',
  'Wellfound',
  'Lever',
  'Ashby',
  'YC Jobs',
] as const;

function openDashboard(): void {
  void chrome.tabs.create({ url: DASHBOARD_URL });
}

/** "2h ago", "yesterday", "3d ago" — short enough for an 11px meta line. */
function relativeTime(ms: number | null): string {
  if (ms === null) return '';
  const diff = Date.now() - ms;
  if (diff < 60 * 1000) return 'just now';
  const mins = Math.floor(diff / (60 * 1000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(diff / (60 * 60 * 1000));
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return formatDate(ms);
}

/**
 * What the popup shows on a page it cannot track.
 *
 * This screen used to be one grey sentence and a button, which is a fair
 * description of nothing happening and a poor advertisement for an extension
 * whose whole point is that it works while you are not looking. So it now
 * answers one of two questions depending on what there is to say: "here is what
 * I have been picking up" once there is history, and "here is where I do that
 * unattended" before there is.
 *
 * The static half is drawn immediately and the activity is filled in when it
 * arrives, because a popup that waits on the network before painting anything
 * is the thing that feels broken.
 */
function renderNotJobPage(root: HTMLElement, url: string): void {
  clear(root);

  const summary = h('p', { class: 'summary-line' }, 'Nothing to track on this page.');
  const slot = h('div');

  const extractBtn = h('button', { class: 'btn btn-secondary', type: 'button' }, 'Extract with AI');
  extractBtn.addEventListener('click', () => {
    renderExtracting(root, url);
  });

  const dashLink = h('button', { class: 'footer-link', type: 'button' }, 'Open dashboard →');
  dashLink.addEventListener('click', openDashboard);

  root.appendChild(summary);
  root.appendChild(slot);
  root.appendChild(extractBtn);
  root.appendChild(dashLink);

  // The fallback is drawn first so that a failed or slow request leaves a
  // complete screen rather than a gap.
  renderSupportedSites(slot);

  const epochAtFetch = viewEpoch;
  void fetchRecentActivity().then((activity) => {
    if (viewEpoch !== epochAtFetch) return;
    if (!activity || activity.items.length === 0) return;

    summary.textContent = '';
    if (activity.thisWeek > 0) {
      summary.appendChild(h('span', { class: 'summary-count' }, String(activity.thisWeek)));
      summary.appendChild(
        document.createTextNode(
          activity.thisWeek === 1 ? ' job tracked this week.' : ' jobs tracked this week.',
        ),
      );
    } else {
      summary.appendChild(
        document.createTextNode(
          `${activity.total} tracked in total. Nothing new in the last seven days.`,
        ),
      );
    }

    clear(slot);
    renderRecentList(slot, activity);
  });
}

/** The no-history fallback: what the extension does when left alone. */
function renderSupportedSites(parent: HTMLElement): void {
  parent.appendChild(h('p', { class: 'section-label' }, 'Captures automatically on'));
  const grid = h('div', { class: 'site-grid' });
  for (const site of AUTO_CAPTURE_SITES) {
    grid.appendChild(h('div', { class: 'site-item' }, site));
  }
  parent.appendChild(grid);
  parent.appendChild(
    h(
      'p',
      { class: 'summary-line' },
      'Anywhere else, open the posting and extract it by hand below.',
    ),
  );
}

function renderRecentList(parent: HTMLElement, activity: RecentActivity): void {
  parent.appendChild(h('p', { class: 'section-label' }, 'Recent'));
  const list = h('div', { class: 'recent-list' });

  /*
   * Rows are deliberately not clickable.
   *
   * A row that responds to a click promises to take you to that job, and there
   * is no honest way to keep that promise: there is no per-application URL to
   * deep link to, and the popup authenticates with an extension key while the
   * dashboard uses the browser's own session — so on a machine signed into a
   * different jlog account, a work job would open a personal applications list
   * that does not contain it. One "Open dashboard" link below makes the weaker,
   * true offer instead.
   */
  for (const item of activity.items) {
    const row = h('div', { class: 'recent-item' });
    row.appendChild(h('div', { class: 'recent-company' }, item.company));
    const when = relativeTime(item.createdAt);
    row.appendChild(
      h('div', { class: 'recent-meta' }, when ? `${item.role} · ${when}` : item.role),
    );
    list.appendChild(row);
  }

  parent.appendChild(list);
}

/** Never throws, and answers null for anything short of a usable result. */
async function fetchRecentActivity(): Promise<RecentActivity | null> {
  try {
    const resp = (await sendMessage({ type: 'RECENT_ACTIVITY' })) as {
      activity?: RecentActivity | null;
    };
    return resp?.activity ?? null;
  } catch {
    return null;
  }
}

function renderExtractingViaLLM(
  root: HTMLElement,
  url: string,
  tabId: number,
  extractPageText?: () => string | Promise<string>,
): void {
  chrome.scripting.executeScript(
    {
      target: { tabId },
      func: extractPageText ?? (() => document.body.innerText),
    },
    (results) => {
      if (chrome.runtime.lastError || !results?.[0]) {
        renderError(root, chrome.runtime.lastError?.message ?? 'Could not read this page.');
        return;
      }
      const pageText = (results[0].result as string).slice(0, 10000);
      sendMessage({ type: 'EXTRACT_REQUEST', text: pageText.slice(0, 6000), url })
        .then((resp) => {
          const response = resp as {
            job: ExtractedJob | null;
            error?: string;
            status?: number;
          };
          // An auth failure is its own screen, not an extraction error. The
          // status code is what makes the two tellable apart — matching on
          // the text of the message used to miss almost every real 401.
          if (response.status === 401) {
            void handleAuthFailure(root);
            return;
          }
          if (response.error ?? !response.job) {
            renderError(root, response.error ?? 'Could not extract job details.');
            return;
          }
          renderConfirmExtracted(root, response.job, url, pageText);
        })
        .catch((err: unknown) => {
          renderError(root, String(err));
        });
    },
  );
}

function renderExtracting(root: HTMLElement, url: string): void {
  viewEpoch += 1;
  renderSpinner(root);

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab?.id) {
      renderError(root, 'Cannot access current tab.');
      return;
    }
    const tabId = tab.id;

    // For a site we already have real selectors for, read the DOM directly instead
    // of dumping the whole page into the LLM. On LinkedIn's search-results split
    // view especially, a whole-page dump is the list of *other* job cards, not the
    // open job's own details — the LLM never even sees the real posting there.
    const siteExtractor = matchSiteExtractor(url);
    if (siteExtractor) {
      chrome.scripting.executeScript(
        { target: { tabId }, func: siteExtractor.extract },
        (results) => {
          const domResult = results?.[0]?.result as
            | { company: string; role: string; logoUrl?: string }
            | undefined;
          if (!chrome.runtime.lastError && domResult?.company && domResult?.role) {
            const job = {
              company: domResult.company,
              role: domResult.role,
              location: null,
              confidence: 1,
              ...(domResult.logoUrl ? { logoUrl: domResult.logoUrl } : {}),
            };
            // Company/role came straight from the DOM, so there's no need to
            // call the LLM at all — but also read the description straight
            // from the DOM (no LLM) so the field isn't left blank just
            // because the fast path skipped the LLM call.
            if (siteExtractor.extractPageText) {
              chrome.scripting.executeScript(
                { target: { tabId }, func: siteExtractor.extractPageText },
                (textResults) => {
                  const description = textResults?.[0]?.result as string | undefined;
                  renderConfirmExtracted(root, job, url, description);
                },
              );
              return;
            }
            renderConfirmExtracted(root, job, url);
            return;
          }
          // Selectors found nothing (page not fully loaded, or markup changed) —
          // fall back to the LLM path rather than dead-ending the user.
          renderExtractingViaLLM(root, url, tabId, siteExtractor.extractPageText);
        },
      );
      return;
    }

    renderExtractingViaLLM(root, url, tabId);
  });
}

function renderConfirmExtracted(
  root: HTMLElement,
  job: ExtractedJob,
  url: string,
  scrapedText?: string,
): void {
  clear(root);

  const label = h('p', { class: 'section-label' }, 'Extracted — confirm to track');

  const companyInput = h('input', {
    class: 'input',
    type: 'text',
    value: job.company,
    id: 'confirm-company',
  }) as HTMLInputElement;

  const roleInput = h('input', {
    class: 'input',
    type: 'text',
    value: job.role,
    id: 'confirm-role',
  }) as HTMLInputElement;

  const locationInput = h('input', {
    class: 'input',
    type: 'text',
    value: job.location ?? '',
    id: 'confirm-location',
    placeholder: 'Location (optional)',
  }) as HTMLInputElement;

  const statusSelect = h('select', {
    class: 'input select',
    id: 'confirm-status',
  }) as HTMLSelectElement;
  const statusOptions: [string, string][] = [
    ['saved', 'Saved'],
    ['applied', 'Applied'],
    ['interviewing', 'Interviewing'],
    ['offer', 'Offer'],
    ['rejected', 'Rejected'],
    ['withdrawn', 'Withdrawn'],
  ];
  for (const [val, label] of statusOptions) {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = label;
    if (val === 'saved') opt.selected = true;
    statusSelect.appendChild(opt);
  }

  const notesTextarea = h('textarea', {
    class: 'input textarea',
    id: 'confirm-notes',
    placeholder: 'Notes (optional)',
    rows: '3',
  }) as HTMLTextAreaElement;

  const jobDescTextarea = h('textarea', {
    class: 'input textarea',
    id: 'confirm-job-desc',
    placeholder: 'Job description (auto-scraped, optional)',
    rows: '4',
  }) as HTMLTextAreaElement;
  if (scrapedText) jobDescTextarea.value = scrapedText;

  const btnRow = h('div', { class: 'confirm-row' });
  const cancelBtn = h('button', { class: 'btn btn-secondary', type: 'button' }, 'Cancel');
  const saveBtn = h('button', { class: 'btn btn-primary', type: 'button' }, 'Track');

  cancelBtn.addEventListener('click', () => init());

  saveBtn.addEventListener('click', () => {
    const loc = locationInput.value.trim();
    const notes = notesTextarea.value.trim();
    const jobDescription = jobDescTextarea.value.trim();
    const statusVal = (statusSelect.value || 'saved') as NonNullable<DetectedJob['status']>;
    const detectedJob: DetectedJob = {
      company: companyInput.value.trim() || job.company,
      role: roleInput.value.trim() || job.role,
      ...(loc ? { location: loc } : {}),
      status: statusVal,
      ...(notes ? { notes } : {}),
      ...(jobDescription ? { jobDescription } : {}),
      sourceUrl: url,
      sourceSite: 'generic',
      ...(job.logoUrl ? { logoUrl: job.logoUrl } : {}),
    };
    renderSaving(root, detectedJob);
  });

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(saveBtn);

  root.appendChild(label);
  root.appendChild(
    h('div', { class: 'field-row' }, h('div', { class: 'field-label' }, 'Company'), companyInput),
  );
  root.appendChild(
    h('div', { class: 'field-row' }, h('div', { class: 'field-label' }, 'Role'), roleInput),
  );
  root.appendChild(
    h('div', { class: 'field-row' }, h('div', { class: 'field-label' }, 'Location'), locationInput),
  );
  root.appendChild(
    h('div', { class: 'field-row' }, h('div', { class: 'field-label' }, 'Status'), statusSelect),
  );
  root.appendChild(
    h('div', { class: 'field-row' }, h('div', { class: 'field-label' }, 'Notes'), notesTextarea),
  );
  root.appendChild(
    h(
      'div',
      { class: 'field-row' },
      h('div', { class: 'field-label' }, 'Job Description'),
      jobDescTextarea,
    ),
  );
  root.appendChild(btnRow);
}

function renderJobPageDetected(root: HTMLElement, url: string, _tabTitle: string): void {
  clear(root);

  const label = h('p', { class: 'section-label' }, 'Track this page');
  const hint = h(
    'p',
    { class: 'summary-line' },
    'Pull the company, role and description off this posting, then confirm before it is saved.',
  );

  const extractBtn = h('button', { class: 'btn btn-primary', type: 'button' }, 'Extract with AI');

  extractBtn.addEventListener('click', () => {
    renderExtracting(root, url);
  });

  const dashLink = h('button', { class: 'footer-link', type: 'button' }, 'Open dashboard →');
  dashLink.addEventListener('click', openDashboard);

  root.appendChild(label);
  root.appendChild(hint);
  root.appendChild(extractBtn);
  root.appendChild(dashLink);
}

function renderSaving(root: HTMLElement, job: DetectedJob): void {
  viewEpoch += 1;
  renderSpinner(root);

  sendMessage({ type: 'SAVE_JOB', job })
    .then((resp) => {
      const response = resp as { ok: boolean; error?: string; status?: number };
      if (response.ok) {
        renderSaved(root, job);
      } else if (response.status === 401) {
        void handleAuthFailure(root);
      } else {
        renderError(root, response.error ?? 'Failed to save application.');
      }
    })
    .catch((err: unknown) => {
      renderError(root, String(err));
    });
}

function renderSaved(root: HTMLElement, job: DetectedJob): void {
  clear(root);

  const toast = h('div', { class: 'toast toast-success' }, '✓ Tracked!');
  root.appendChild(toast);
  renderJobCard(root, job);

  const resetBtn = h('button', { class: 'btn btn-secondary', type: 'button' }, 'Track another');
  resetBtn.addEventListener('click', () => init());
  root.appendChild(resetBtn);
}

function renderError(root: HTMLElement, message: string): void {
  clear(root);

  const toast = h('div', { class: 'toast toast-error' }, `✗ ${message}`);
  const retryBtn = h('button', { class: 'btn btn-secondary', type: 'button' }, 'Try again');
  retryBtn.addEventListener('click', () => init());

  root.appendChild(toast);
  root.appendChild(retryBtn);
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/**
 * A request came back 401. The background has already asked the server why, so
 * the cached answer here is fresh and specific — expired, revoked, or unknown.
 */
async function handleAuthFailure(root: HTMLElement): Promise<void> {
  const conn = (await getCachedConnection()) ?? (await checkConnectionViaBackground());
  renderStatus(conn);
  renderConnect(root, conn);
}

/** The normal screen, once the key is known to be usable. */
function renderForTab(root: HTMLElement, conn: Connection): void {
  // Bumped here rather than in the callback: the guard in init() reads it
  // straight after this returns, and tabs.query resolves later.
  viewEpoch += 1;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    const url = tab?.url ?? '';
    const title = tab?.title ?? '';

    if (isRestrictedPage(url)) {
      clear(root);
      root.appendChild(h('div', { class: 'headline' }, 'Nothing to track here'));
      root.appendChild(
        h(
          'p',
          { class: 'body-text' },
          'Chrome does not let extensions read its own pages or the Web Store. Open a job posting and try again.',
        ),
      );
      return;
    }

    // Renewal nudge, while there is still time to act on it calmly.
    const expiringSoon = conn.expiresAt !== null && conn.expiresAt - Date.now() < RENEW_WARNING_MS;

    if (isJobPage(url)) {
      renderJobPageDetected(root, url, title);
    } else {
      renderNotJobPage(root, url);
    }

    if (expiringSoon && conn.expiresAt !== null) {
      const notice = h(
        'div',
        { class: 'notice' },
        `Your key ${describeExpiry(conn.expiresAt)} (${formatDate(conn.expiresAt)}). `,
      );
      const link = h('button', { class: 'link' }, 'Renew it in Settings');
      link.addEventListener('click', openSettings);
      notice.appendChild(link);
      root.insertBefore(notice, root.firstChild);
    }
  });
}

async function init(): Promise<void> {
  const root = document.getElementById('root');
  if (!root) return;

  renderSpinner(root);

  const token = await getToken();
  if (!token) {
    renderStatus(null);
    renderConnect(root, null);
    return;
  }

  const cached = await getCachedConnection();

  // A key whose expiry has already passed needs no round trip to diagnose —
  // show the honest screen immediately rather than a spinner or, worse, a
  // working-looking screen that fails on the first click.
  const knownDead =
    cached &&
    (cached.status === 'expired' ||
      cached.status === 'rejected' ||
      (cached.status === 'active' && cached.expiresAt !== null && cached.expiresAt <= Date.now()));

  if (knownDead) {
    const conn: Connection = {
      ...cached,
      status: cached.status === 'rejected' ? 'rejected' : 'expired',
    };
    renderStatus(conn);
    renderConnect(root, conn);
    // Still re-check: the key may have been extended, or the cache may be stale.
    void checkConnectionViaBackground().then((fresh) => {
      if (fresh.status === 'active') init();
    });
    return;
  }

  // Nothing has ever been verified: an install upgraded from a build that
  // stored only the key, or a key written before this state existed. There is
  // no earlier answer to be optimistic from, so drawing the tracking screen
  // here would be inventing one — and a key that is in fact dead would offer
  // actions that spend a doomed request, while the guard below suppressed the
  // screen explaining why. Wait for the real answer; it is one request.
  if (!cached) {
    const first = await checkConnectionViaBackground();
    renderStatus(first);
    if (first.status === 'active') renderForTab(root, first);
    else renderConnect(root, first);
    return;
  }

  // With a prior answer in hand, draw the useful screen straight away —
  // waiting on the network before showing anything is what makes a popup feel
  // broken — and correct it if the fresh check disagrees.
  const optimistic: Connection = cached;
  renderStatus(optimistic);
  renderForTab(root, optimistic);

  const epochAtCheck = viewEpoch;
  const fresh = await checkConnectionViaBackground();
  // The header line is always safe to update; it is not something anyone is
  // mid-way through using.
  renderStatus(fresh);

  // Everything below replaces the whole view, so it only happens if nobody has
  // clicked anything since — an offline blip must not wipe a half-filled form.
  if (viewEpoch !== epochAtCheck) return;

  if (fresh.status === 'expired' || fresh.status === 'rejected') {
    renderConnect(root, fresh);
    return;
  }
  // Redraw on a good key only when the optimistic guess was missing something
  // the screen depends on, i.e. the renewal notice.
  if (fresh.status === 'active' && optimistic.expiresAt !== fresh.expiresAt) {
    renderForTab(root, fresh);
  }
}

void init();
