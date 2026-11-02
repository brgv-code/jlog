import {
  checkConnection,
  clearToken,
  getCachedConnection,
  getToken,
  rememberedKeyFor,
  setCachedConnection,
  setToken,
} from './connection';

// Messages jlog.ai sends so the extension follows whichever account is signed in there.
export type WebsiteMessage =
  | { type: 'jlog:signed-in'; accountId: string }
  | { type: 'jlog:key'; accountId: string; key: string }
  | { type: 'jlog:signed-out' };

export type SyncReply = {
  status: 'connected' | 'needs-key' | 'rejected' | 'offline' | 'disconnected' | 'ignored';
};

function parse(message: unknown): WebsiteMessage | null {
  if (typeof message !== 'object' || message === null) return null;
  const { type, accountId, key } = message as Record<string, unknown>;
  if (type === 'jlog:signed-out') return { type };
  if (typeof accountId !== 'string' || !accountId) return null;
  if (type === 'jlog:signed-in') return { type, accountId };
  if (type === 'jlog:key' && typeof key === 'string' && key.length > 0 && key.length < 200) {
    return { type, accountId, key };
  }
  return null;
}

/** Stores the key, then trusts it only once the server says it belongs to that account. */
async function useKey(key: string, accountId: string): Promise<SyncReply> {
  await setToken(key);
  const conn = await checkConnection();
  if (conn.status === 'offline') return { status: 'offline' };
  return conn.status === 'active' && conn.account?.id === accountId
    ? { status: 'connected' }
    : { status: 'rejected' };
}

export async function handleWebsiteMessage(message: unknown): Promise<SyncReply> {
  const msg = parse(message);
  if (!msg) return { status: 'ignored' };

  if (msg.type === 'jlog:signed-out') {
    await clearToken();
    await setCachedConnection({ status: 'no-key', expiresAt: null, label: null, account: null });
    return { status: 'disconnected' };
  }

  if (msg.type === 'jlog:key') return useKey(msg.key, msg.accountId);

  const current = await getCachedConnection();
  if (current?.status === 'active' && current.account?.id === msg.accountId && (await getToken())) {
    return { status: 'connected' };
  }

  const remembered = await rememberedKeyFor(msg.accountId);
  if (!remembered) return { status: 'needs-key' };

  const switched = await useKey(remembered, msg.accountId);
  // A remembered key that no longer works has been forgotten by now; jlog.ai makes a fresh one.
  return switched.status === 'rejected' ? { status: 'needs-key' } : switched;
}
