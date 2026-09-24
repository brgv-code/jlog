// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Connection } from '../lib/connection';
import type { RecentActivity } from '../types';

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
  /** What the background reports for RECENT_ACTIVITY; null means "no answer". */
  activity: RecentActivity | null;
  /** Withhold the background's answer until `release()` is called. */
  hold?: boolean;
}

let stubs: Stubs;
let pending: (() => void)[] = [];

function release(): void {
  const queued = pending;
  pending = [];
  for (const fn of queued) fn();
}

function installChromeStub(): void {
  const chromeStub = {
    runtime: {
      lastError: undefined as { message: string } | undefined,
      sendMessage: (_msg: unknown, cb: (r: unknown) => void) => {
        // The idle screen asks for recent activity; everything else in these
        // tests is the connection check.
        if ((_msg as { type?: string })?.type === 'RECENT_ACTIVITY') {
          cb({ activity: stubs.activity });
          return;
        }
        const answer = () => {
          if ('__throw' in stubs.connection) {
            chromeStub.runtime.lastError = { message: 'Could not establish connection.' };
            cb(undefined);
            chromeStub.runtime.lastError = undefined;
            return;
          }
          cb({ connection: stubs.connection });
        };
        // `hold` lets a test inspect what the popup shows while the check is
        // still in flight, which is where an unverified key can be misreported.
        if (stubs.hold) pending.push(answer);
        else answer();
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
  account: null,
  checkedAt: Date.now(),
});

beforeEach(() => {
  stubs = {
    storage: {},
    connection: active(null),
    tabUrl: 'https://www.linkedin.com/jobs/view/123',
    activity: null,
  };
  pending = [];
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
      account: null,
      checkedAt: Date.now(),
    } satisfies Connection;
    stubs.connection = {
      status: 'expired',
      expiresAt: expiredOn,
      label: null,
      account: null,
      checkedAt: 0,
    };

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
      account: null,
      checkedAt: Date.now(),
    } satisfies Connection;
    stubs.connection = {
      status: 'rejected',
      expiresAt: null,
      label: null,
      account: null,
      checkedAt: 0,
    };

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
      account: null,
      checkedAt: 0,
    };

    const root = await openPopup();
    expect(root.textContent).toContain('Your jlog key expired');
  });

  it('shows the tracking screen for a healthy key', async () => {
    stubs.storage.jlog_token = 'good-key';
    stubs.storage.jlog_connection = active(null);
    const root = await openPopup();
    expect(root.textContent).toContain('Track this page');
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
    expect(root.textContent).toContain('Track this page');
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

describe('an upgraded install, carrying a key but no cached verdict', () => {
  it('does not claim the key is good before the server has said so', async () => {
    // The state an existing user upgrades into: jlog_token is there from the
    // old build, jlog_connection has never been written.
    stubs.storage.jlog_token = 'key-from-the-old-build';
    stubs.connection = {
      status: 'expired',
      expiresAt: Date.now() - 60_000,
      label: null,
      account: null,
      checkedAt: 0,
    };

    const root = await openPopup();
    expect(root.textContent).toContain('Your jlog key expired');
    expect(root.textContent).not.toContain('Track this page');
    expect(document.getElementById('status')?.textContent).not.toContain('no expiry');
  });

  it('offers no tracking actions while the key is still being checked', async () => {
    // The window that matters: acting inside it spends a doomed request and
    // suppresses the corrective screen until that request fails.
    stubs.storage.jlog_token = 'key-from-the-old-build';
    stubs.connection = {
      status: 'expired',
      expiresAt: Date.now() - 60_000,
      label: null,
      account: null,
      checkedAt: 0,
    };
    stubs.hold = true;

    const root = await openPopup();
    expect(root.textContent).not.toContain('Track this page');
    expect(root.textContent).not.toContain('Extract with AI');
    expect(document.getElementById('status')?.textContent).not.toContain('no expiry');

    release();
    await new Promise((r) => setTimeout(r, 0));
    expect(root.textContent).toContain('Your jlog key expired');
  });

  it('still renders instantly for a returning user with a cached verdict', async () => {
    // The optimism is justified here: there is a prior answer to stand on, so
    // a held check must not delay the useful screen.
    stubs.storage.jlog_token = 'good-key';
    stubs.storage.jlog_connection = active(null);
    stubs.hold = true;

    const root = await openPopup();
    expect(root.textContent).toContain('Track this page');
  });
});

/**
 * The idle screen — what the popup shows on a page it cannot track. It used to
 * be one grey sentence and a button, which is why these exist: the screen has
 * to carry something useful whether or not the activity request succeeds.
 */
describe('the screen for a page with nothing to track', () => {
  beforeEach(() => {
    stubs.storage.jlog_token = 'good-key';
    stubs.storage.jlog_connection = active(null);
    stubs.tabUrl = 'https://example.com/about-us';
  });

  it('falls back to what the extension does unattended when there is no history', async () => {
    stubs.activity = { items: [], thisWeek: 0, total: 0 };

    const root = await openPopup();
    expect(root.textContent).toContain('Captures automatically on');
    expect(root.textContent).toContain('LinkedIn');
    expect(root.textContent).toContain('Greenhouse');
    // The manual escape hatch stays available on every version of this screen.
    expect(root.textContent).toContain('Extract with AI');
  });

  it('shows recent jobs and the weekly count once there are some', async () => {
    stubs.activity = {
      items: [
        {
          id: '1',
          company: 'Staffbase',
          role: 'Staff Engineer',
          status: 'applied',
          createdAt: Date.now() - 2 * 60 * 60 * 1000,
        },
        {
          id: '2',
          company: 'Linear',
          role: 'Product Engineer',
          status: 'saved',
          createdAt: Date.now() - 26 * 60 * 60 * 1000,
        },
      ],
      thisWeek: 4,
      total: 31,
    };

    const root = await openPopup();
    expect(root.textContent).toContain('4');
    expect(root.textContent).toContain('jobs tracked this week');
    expect(root.textContent).toContain('Staffbase');
    expect(root.textContent).toContain('Staff Engineer');
    expect(root.textContent).toContain('2h ago');
    expect(root.textContent).toContain('yesterday');
    // The list replaces the fallback rather than stacking on top of it.
    expect(root.textContent).not.toContain('Captures automatically on');
  });

  it('keeps a complete screen when the activity request comes back empty-handed', async () => {
    // A slow or unreachable API must not turn "nothing to track here" into an
    // error, or an outage looks like a broken extension.
    stubs.activity = null;

    const root = await openPopup();
    expect(root.textContent).toContain('Nothing to track on this page.');
    expect(root.textContent).toContain('Captures automatically on');
    expect(root.textContent).toContain('Extract with AI');
  });
});

describe('pasting a key that works', () => {
  it('says so, and names the account, before moving on', async () => {
    stubs.connection = {
      status: 'active',
      expiresAt: null,
      label: 'MacBook',
      account: { email: 'you@example.com', name: 'You' },
      checkedAt: Date.now(),
    };

    const root = await openPopup();
    // Starts on the paste screen: nothing is stored yet.
    const input = document.getElementById('token-input') as HTMLInputElement;
    expect(input).toBeTruthy();

    input.value = 'a-real-key';
    const connectBtn = Array.from(root.querySelectorAll('button')).find(
      (b) => b.textContent === 'Connect',
    );
    connectBtn?.click();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(root.textContent).toContain('Connected');
    expect(root.textContent).toContain('you@example.com');
    // The mark is present to be animated against; without it there is no tip.
    expect(root.querySelector('.tip-mark')).toBeTruthy();
    expect(root.querySelector('.tip-dot')).toBeTruthy();
  });
});
