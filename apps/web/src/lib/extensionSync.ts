import { EXTENSION_IDS } from '../data/extension';
import { apiFetch } from './api';

// Keeps an installed jlog extension on the account signed in here (apps/extension/src/lib/accountSync.ts).

interface Runtime {
  sendMessage(extensionId: string, message: unknown, reply: (response: unknown) => void): void;
  lastError?: { message?: string };
}

type Reply = { status: string } | null;

// Chrome exposes this to a page only when an installed extension lists the site as allowed to message it.
function runtime(): Runtime | null {
  const chrome = (window as unknown as { chrome?: { runtime?: Runtime } }).chrome;
  return typeof chrome?.runtime?.sendMessage === 'function' ? chrome.runtime : null;
}

function send(extensionId: string, message: unknown): Promise<Reply> {
  const rt = runtime();
  if (!rt) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      rt.sendMessage(extensionId, message, (response) => {
        // Set when that extension is not installed; reading it is what keeps Chrome from logging an error.
        resolve(rt.lastError ? null : ((response as Reply) ?? null));
      });
    } catch {
      // Thrown instead of lastError for an ID this page may not message at all.
      resolve(null);
    }
  });
}

async function createKey(): Promise<string | null> {
  const res = await apiFetch('/api/extension/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label: 'Connected automatically' }),
  });
  if (!res.ok) return null;
  return ((await res.json()) as { token: string }).token;
}

/** Every signed-in page. A demo account never takes the extension over from a real one. */
export async function connectExtension(user: {
  id?: string | undefined;
  demo?: boolean | undefined;
}): Promise<void> {
  if (!user.id || user.demo) return;
  for (const extensionId of EXTENSION_IDS) {
    const reply = await send(extensionId, { type: 'jlog:signed-in', accountId: user.id });
    if (reply?.status !== 'needs-key') continue;
    const key = await createKey();
    if (key) await send(extensionId, { type: 'jlog:key', accountId: user.id, key });
  }
}

export async function disconnectExtension(): Promise<void> {
  await Promise.all(
    EXTENSION_IDS.map((extensionId) => send(extensionId, { type: 'jlog:signed-out' })),
  );
}
