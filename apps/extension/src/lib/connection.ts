/**
 * Everything the extension knows about its key: the value, whether the server
 * still accepts it, and when it dies.
 *
 * This exists because the old code had no idea. It stored a key, assumed it
 * worked, and on the first 401 quietly deleted it — so an expired key surfaced
 * as "Could not extract job details", and the key was gone by the time the user
 * reopened the popup. Keeping a named state, and keeping the dead key around
 * long enough to explain itself, is the whole fix.
 */

export const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:8787';

export const WEB_BASE: string =
  (import.meta.env.VITE_WEB_BASE as string | undefined) ?? 'http://localhost:4321';

export const SETTINGS_URL = `${WEB_BASE}/settings`;

const TOKEN_KEY = 'jlog_token';
const STATE_KEY = 'jlog_connection';

/** Below this much life left, the popup starts nudging you to renew. */
export const RENEW_WARNING_MS = 3 * 24 * 60 * 60 * 1000;

export type ConnectionStatus =
  /** Nothing pasted yet. */
  | 'no-key'
  /** Server accepted the key. */
  | 'active'
  /** Server knows this key and it ran out. */
  | 'expired'
  /** Server does not know this key: revoked, or from a different account. */
  | 'rejected'
  /** Could not reach the server at all — says nothing about the key. */
  | 'offline';

export interface Connection {
  status: ConnectionStatus;
  /** Epoch ms, or null for a key with no expiry (or when unknown). */
  expiresAt: number | null;
  label: string | null;
  /** When this was last confirmed with the server, epoch ms. */
  checkedAt: number;
}

export async function getToken(): Promise<string | null> {
  const result = await chrome.storage.local.get(TOKEN_KEY);
  return (result[TOKEN_KEY] as string | undefined) ?? null;
}

export async function setToken(token: string): Promise<void> {
  // A newly pasted key starts out unverified rather than assumed good: the
  // popup verifies it before claiming the extension is connected.
  await chrome.storage.local.set({ [TOKEN_KEY]: token });
  await chrome.storage.local.remove(STATE_KEY);
}

export async function clearToken(): Promise<void> {
  await chrome.storage.local.remove([TOKEN_KEY, STATE_KEY]);
}

/** The last answer the server gave, if any. Null when nothing has been checked. */
export async function getCachedConnection(): Promise<Connection | null> {
  const result = await chrome.storage.local.get(STATE_KEY);
  return (result[STATE_KEY] as Connection | undefined) ?? null;
}

export async function setCachedConnection(
  conn: Omit<Connection, 'checkedAt'> & { checkedAt?: number },
): Promise<Connection> {
  const stored: Connection = { ...conn, checkedAt: conn.checkedAt ?? Date.now() };
  await chrome.storage.local.set({ [STATE_KEY]: stored });
  return stored;
}

/**
 * Ask the server about the stored key. Always resolves — a network failure is
 * reported as `offline`, never as a bad key, because telling someone their key
 * expired when the wifi dropped sends them to regenerate a perfectly good one.
 */
export async function checkConnection(): Promise<Connection> {
  const token = await getToken();
  if (!token) {
    return setCachedConnection({ status: 'no-key', expiresAt: null, label: null });
  }

  try {
    const res = await fetch(`${API_BASE}/api/extension/session`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      // The endpoint answers 200 for every key verdict, so a non-2xx here is
      // the server itself being unwell, not a statement about the key.
      return setCachedConnection({ status: 'offline', expiresAt: null, label: null });
    }
    const data = (await res.json()) as {
      status: 'active' | 'expired' | 'unknown';
      expiresAt: string | null;
      label: string | null;
    };
    const expiresAt = data.expiresAt ? new Date(data.expiresAt).getTime() : null;
    const status: ConnectionStatus =
      data.status === 'active' ? 'active' : data.status === 'expired' ? 'expired' : 'rejected';
    return setCachedConnection({ status, expiresAt, label: data.label });
  } catch {
    return setCachedConnection({ status: 'offline', expiresAt: null, label: null });
  }
}

/** Plain-language expiry, for the popup's status line. */
export function describeExpiry(expiresAt: number | null): string {
  if (expiresAt === null) return 'no expiry';
  const ms = expiresAt - Date.now();
  if (ms <= 0) return 'expired';
  const hours = Math.round(ms / (60 * 60 * 1000));
  if (hours < 24) return `expires in ${hours}h`;
  const days = Math.round(ms / (24 * 60 * 60 * 1000));
  return days === 1 ? 'expires tomorrow' : `expires in ${days} days`;
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
