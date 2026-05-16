import type { DetectedJob, ExtractedJob } from '../types';

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

async function getToken(): Promise<string | null> {
  const result = await chrome.storage.local.get('jlog_token');
  return (result.jlog_token as string | undefined) ?? null;
}

async function setToken(token: string): Promise<void> {
  await chrome.storage.local.set({ jlog_token: token });
}

function sendMessage(msg: unknown): Promise<unknown> {
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

function renderNoToken(root: HTMLElement): void {
  clear(root);

  const label = h('p', { class: 'section-label' }, 'Extension Token');
  const hint = h(
    'p',
    { style: 'color:#888;font-size:12px;margin-bottom:10px;line-height:1.5' },
    'Paste the token from your jlog settings page to connect the extension.',
  );
  const input = h('input', {
    class: 'input monospace gap',
    type: 'text',
    placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    id: 'token-input',
  }) as HTMLInputElement;

  const saveBtn = h('button', { class: 'btn btn-primary', type: 'button' }, 'Save Token');

  const warning = h('p', { class: 'warning' }, 'Generate a token at: ');
  const settingsLink = h(
    'a',
    {
      href: '#',
      target: '_blank',
      style: 'color:#888;font-size:11px;',
    },
    'jlog Settings → Extension',
  );

  saveBtn.addEventListener('click', async () => {
    const val = input.value.trim();
    if (!val) return;
    await setToken(val);
    init();
  });

  root.appendChild(label);
  root.appendChild(hint);
  root.appendChild(input);
  root.appendChild(h('div', { style: 'margin-bottom:8px' }));
  root.appendChild(saveBtn);
  warning.appendChild(settingsLink);
  root.appendChild(warning);
}

function renderDisconnected(root: HTMLElement): void {
  clear(root);
  const msg = h(
    'p',
    { style: 'color:#888;font-size:12px;margin-bottom:12px;line-height:1.5' },
    'Session expired. Generate a new token in Settings.',
  );
  const resetBtn = h('button', { class: 'btn btn-secondary', type: 'button' }, 'Re-enter token');
  resetBtn.addEventListener('click', async () => {
    await chrome.storage.local.remove('jlog_token');
    init();
  });
  root.appendChild(msg);
  root.appendChild(resetBtn);
}

function renderNotJobPage(root: HTMLElement, url: string): void {
  clear(root);

  const msg = h(
    'p',
    { style: 'color:#888;font-size:12px;margin-bottom:12px;line-height:1.5' },
    'Open a job page to track it automatically.',
  );
  const extractBtn = h('button', { class: 'btn btn-secondary', type: 'button' }, 'Extract with AI');

  extractBtn.addEventListener('click', () => {
    renderExtracting(root, url);
  });

  root.appendChild(msg);
  root.appendChild(extractBtn);
}

function renderExtracting(root: HTMLElement, url: string): void {
  renderSpinner(root);

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab?.id) {
      renderError(root, 'Cannot access current tab.');
      return;
    }
    const tabId = tab.id;

    chrome.scripting.executeScript(
      {
        target: { tabId },
        func: () => document.body.innerText.slice(0, 6000),
      },
      (results) => {
        if (chrome.runtime.lastError || !results?.[0]) {
          renderError(root, chrome.runtime.lastError?.message ?? 'Script injection failed.');
          return;
        }
        const text = results[0].result as string;
        sendMessage({ type: 'EXTRACT_REQUEST', text, url })
          .then((resp) => {
            const response = resp as { job: ExtractedJob | null; error?: string };
            if (response.error?.includes('401') || response.error?.includes('Unauthorized')) {
              renderDisconnected(root);
              return;
            }
            if (response.error ?? !response.job) {
              renderError(root, response.error ?? 'Could not extract job details.');
              return;
            }
            renderConfirmExtracted(root, response.job, url);
          })
          .catch((err: unknown) => {
            renderError(root, String(err));
          });
      },
    );
  });
}

function renderConfirmExtracted(root: HTMLElement, job: ExtractedJob, url: string): void {
  clear(root);

  const label = h('p', { class: 'section-label' }, 'Extracted — confirm to track');

  const companyInput = h('input', {
    class: 'input monospace',
    type: 'text',
    value: job.company,
    id: 'confirm-company',
    style: 'margin-bottom:6px',
  }) as HTMLInputElement;

  const roleInput = h('input', {
    class: 'input monospace',
    type: 'text',
    value: job.role,
    id: 'confirm-role',
    style: 'margin-bottom:6px',
  }) as HTMLInputElement;

  const locationInput = h('input', {
    class: 'input monospace',
    type: 'text',
    value: job.location ?? '',
    id: 'confirm-location',
    placeholder: 'Location (optional)',
  }) as HTMLInputElement;

  const btnRow = h('div', { class: 'confirm-row' });

  const cancelBtn = h('button', { class: 'btn btn-secondary', type: 'button' }, 'Cancel');
  const saveBtn = h('button', { class: 'btn btn-primary', type: 'button' }, 'Track');

  cancelBtn.addEventListener('click', () => init());

  saveBtn.addEventListener('click', () => {
    const loc = locationInput.value.trim();
    const detectedJob: DetectedJob = {
      company: companyInput.value.trim() || job.company,
      role: roleInput.value.trim() || job.role,
      ...(loc ? { location: loc } : {}),
      sourceUrl: url,
      sourceSite: 'generic',
      appliedAt: Date.now(),
    };
    renderSaving(root, detectedJob);
  });

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(saveBtn);

  root.appendChild(label);
  root.appendChild(h('div', { class: 'field-label' }, 'Company'));
  root.appendChild(companyInput);
  root.appendChild(h('div', { class: 'field-label' }, 'Role'));
  root.appendChild(roleInput);
  root.appendChild(h('div', { class: 'field-label' }, 'Location'));
  root.appendChild(locationInput);
  root.appendChild(btnRow);
}

function renderJobPageDetected(root: HTMLElement, url: string, _tabTitle: string): void {
  clear(root);

  const label = h('p', { class: 'section-label' }, 'Track This Page');
  const hint = h(
    'p',
    { style: 'color:#888;font-size:12px;margin-bottom:12px;line-height:1.5' },
    'Click "Extract with AI" to detect job details and save this application.',
  );

  const extractBtn = h('button', { class: 'btn btn-primary', type: 'button' }, 'Extract with AI');

  extractBtn.addEventListener('click', () => {
    renderExtracting(root, url);
  });

  root.appendChild(label);
  root.appendChild(hint);
  root.appendChild(extractBtn);
}

function renderSaving(root: HTMLElement, job: DetectedJob): void {
  renderSpinner(root);

  sendMessage({ type: 'SAVE_JOB', job })
    .then((resp) => {
      const response = resp as { ok: boolean; error?: string };
      if (response.ok) {
        renderSaved(root, job);
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

async function init(): Promise<void> {
  const root = document.getElementById('root');
  if (!root) return;

  renderSpinner(root);

  const token = await getToken();
  if (!token) {
    renderNoToken(root);
    return;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    const url = tab?.url ?? '';
    const title = tab?.title ?? '';

    if (isJobPage(url)) {
      renderJobPageDetected(root, url, title);
    } else {
      renderNotJobPage(root, url);
    }
  });
}

init();
