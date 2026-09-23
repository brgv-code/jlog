// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Connection } from '../lib/connection';

/**
 * The popup's opening move, which is what the user actually reported as broken:
 * a key that had quietly expired produced "Could not extract job details" and,
 * after a reload, a blank paste box with no explanation of where the key went.
 *
 * These drive the real popup module against a stubbed `chrome`, so they cover
 * the branch that decides what the first screen says.
 */

interface Stubs {
  storage: Record<string, unknown>;
  connection: Connection | { __throw: true };
  tabUrl: string;
}

let stubs: Stubs;

function installChromeStub(): void {
  const chromeStub = {
    runtime: {
      lastError: undefined as { message: string } | undefined,
      sendMessage: (_msg: unknown, cb: (r: unknown) => void) => {
        if ('__throw' in stubs.connection) {
          chromeStub.runtime.lastError = { message: 'Could not establish connection.' };
          cb(undefined);
          chromeStub.runtime.lastError = undefined;
          return;
        }
        cb({ connection: stubs.connection });
      },
      onMessage: { addListener: () => {} },
      onInstalled: { addListener: () => {} },
    },
    storage: {
      local: {
        get: (key: string | string[]) => {
          const keys = Array.isArray(key) ? key : [key];
          const out: Record<string, unknown> = {};
          for (const k of keys) if (k in stubs.storage) out[k] = stubs.storage[k];
          return Promise.resolve(out);
        },
        set: (items: Record<string, unknown>) => {
          Object.assign(stubs.storage, items);
          return Promise.resolve();
        },
        remove: (key: string | string[]) => {
          for (const k of Array.isArray(key) ? key : [key]) delete stubs.storage[k];
          return Promise.resolve();
        },
      },
    },
    tabs: {
      query: (_q: unknown, cb: (tabs: { url: string; title: string; id: number }[]) => void) =>
        cb([{ url: stubs.tabUrl, title: 'A job', id: 1 }]),
      create: () => {},
    },
    scripting: { executeScript: () => {} },
  };
  (globalThis as unknown as { chrome: unknown }).chrome = chromeStub;
}

/**
 * Loads the popup fresh — it renders on import — and waits for its async init.
 * `settleMs` covers the one retry the popup makes when the background service
 * worker does not answer, which is a real 250ms wait rather than a microtask.
 */
async function openPopup(settleMs = 0): Promise<HTMLElement> {
  document.body.innerHTML =
    '<div class="header"><span id="status"></span></div><div id="root"></div>';
  vi.resetModules();
  await import('./popup');
  await new Promise((r) => setTimeout(r, settleMs));
  await new Promise((r) => setTimeout(r, 0));
  return document.getElementById('root') as HTMLElement;
}

const active = (expiresAt: number | null): Connection => ({
  status: 'active',
  expiresAt,
  label: null,
  checkedAt: Date.now(),
});

beforeEach(() => {
  stubs = {
    storage: {},
    connection: active(null),
    tabUrl: 'https://www.linkedin.com/jobs/view/123',
  };
  installChromeStub();
});

describe('popup first screen', () => {
  it('asks for a key when none has ever been pasted', async () => {
    const root = await openPopup();
    expect(root.textContent).toContain('Connect the extension');
  });

  it('says the key expired, and when, instead of a generic failure', async () => {
    const expiredOn = new Date('2026-03-04T00:00:00Z').getTime();
    stubs.storage.jlog_token = 'a-real-looking-key';
    stubs.storage.jlog_connection = {
      status: 'expired',
      expiresAt: expiredOn,
      label: null,
      checkedAt: Date.now(),
    } satisfies Connection;
    stubs.connection = { status: 'expired', expiresAt: expiredOn, label: null, checkedAt: 0 };

    const root = await openPopup();
    expect(root.textContent).toContain('Your jlog key expired');
    // The date matters: it is what tells someone this was a schedule, not a bug.
    expect(root.textContent).toMatch(/Mar 4, 2026/);
    // And the fix is on the same screen, not somewhere they have to go find.
    expect(root.querySelector('#token-input')).not.toBeNull();
  });

  it('distinguishes a revoked key from an expired one', async () => {
    stubs.storage.jlog_token = 'revoked-key';
    stubs.storage.jlog_connection = {
      status: 'rejected',
      expiresAt: null,
      label: null,
      checkedAt: Date.now(),
    } satisfies Connection;
    stubs.connection = { status: 'rejected', expiresAt: null, label: null, checkedAt: 0 };

    const root = await openPopup();
    expect(root.textContent).toContain('This key is no longer valid');
  });

  it('treats a stored key whose date has passed as expired without asking the server', async () => {
    // The cache still says "active" because nothing has failed yet — the date
    // alone is enough to know, and catching it here is what stops the popup
    // showing a working-looking screen that dies on the first click.
    stubs.storage.jlog_token = 'stale-key';
    stubs.storage.jlog_connection = active(Date.now() - 60_000);
    stubs.connection = {
      status: 'expired',
      expiresAt: Date.now() - 60_000,
      label: null,
      checkedAt: 0,
    };

    const root = await openPopup();
    expect(root.textContent).toContain('Your jlog key expired');
  });

  it('shows the tracking screen for a healthy key', async () => {
    stubs.storage.jlog_token = 'good-key';
    stubs.storage.jlog_connection = active(null);
    const root = await openPopup();
    expect(root.textContent).toContain('Track This Page');
    expect(document.getElementById('status')?.textContent).toContain('no expiry');
  });

  it('nudges about renewal while a key is nearly out, without blocking anything', async () => {
    const soon = Date.now() + 2 * 24 * 60 * 60 * 1000;
    stubs.storage.jlog_token = 'good-key';
    stubs.storage.jlog_connection = active(soon);
    stubs.connection = active(soon);

    const root = await openPopup();
    expect(root.textContent).toContain('expires in 2 days');
    expect(root.textContent).toContain('Renew it in Settings');
    // Still usable — a warning, not a wall.
    expect(root.textContent).toContain('Track This Page');
  });

  it('blames the network, not the key, when the check cannot complete', async () => {
    // Telling someone their key expired because the wifi dropped sends them to
    // regenerate a perfectly good key.
    stubs.storage.jlog_token = 'good-key';
    stubs.storage.jlog_connection = active(null);
    stubs.connection = { __throw: true };

    const root = await openPopup(400);
    expect(root.textContent).not.toContain('expired');
    expect(document.getElementById('status')?.textContent).toContain('offline');
  });

  it('says a Chrome page is off-limits rather than failing at it', async () => {
    stubs.storage.jlog_token = 'good-key';
    stubs.storage.jlog_connection = active(null);
    stubs.tabUrl = 'chrome://extensions';

    const root = await openPopup();
    expect(root.textContent).toContain('Nothing to track here');
  });
});
