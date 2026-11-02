import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Account } from './connection';

/** What /api/extension/session says about each key. */
let server: Record<string, { status: 'active' | 'expired' | 'unknown'; account?: Account }>;
let storage: Record<string, unknown>;

const A = { id: 'acct-a', email: 'a@example.com', name: 'A' };
const B = { id: 'acct-b', email: 'b@example.com', name: 'B' };

beforeEach(() => {
  storage = {};
  server = {};
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: (key: string) => Promise.resolve(key in storage ? { [key]: storage[key] } : {}),
        set: (items: Record<string, unknown>) => {
          Object.assign(storage, items);
          return Promise.resolve();
        },
        remove: (keys: string | string[]) => {
          for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key];
          return Promise.resolve();
        },
      },
    },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      const token = new Headers(init.headers).get('Authorization')?.slice(7) ?? '';
      const verdict = server[token] ?? { status: 'unknown' };
      return new Response(
        JSON.stringify({
          status: verdict.status,
          expiresAt: null,
          label: null,
          account: verdict.account ?? null,
        }),
      );
    }),
  );
});

async function load() {
  vi.resetModules();
  return import('./accountSync');
}

describe('signing in on jlog.ai', () => {
  it('does nothing when the extension is already on that account', async () => {
    server['key-a'] = { status: 'active', account: A };
    const { handleWebsiteMessage } = await load();
    await handleWebsiteMessage({ type: 'jlog:key', accountId: A.id, key: 'key-a' });

    expect(await handleWebsiteMessage({ type: 'jlog:signed-in', accountId: A.id })).toEqual({
      status: 'connected',
    });
    expect(storage.jlog_token).toBe('key-a');
  });

  it('asks for a key for an account it has never seen', async () => {
    const { handleWebsiteMessage } = await load();
    expect(await handleWebsiteMessage({ type: 'jlog:signed-in', accountId: B.id })).toEqual({
      status: 'needs-key',
    });
  });

  it('switches back to the key it remembers for that account, without a new one', async () => {
    server['key-a'] = { status: 'active', account: A };
    server['key-b'] = { status: 'active', account: B };
    const { handleWebsiteMessage } = await load();
    await handleWebsiteMessage({ type: 'jlog:key', accountId: A.id, key: 'key-a' });
    await handleWebsiteMessage({ type: 'jlog:key', accountId: B.id, key: 'key-b' });

    expect(await handleWebsiteMessage({ type: 'jlog:signed-in', accountId: A.id })).toEqual({
      status: 'connected',
    });
    expect(storage.jlog_token).toBe('key-a');
  });

  it('asks for a new key when the remembered one has expired', async () => {
    server['key-a'] = { status: 'active', account: A };
    server['key-b'] = { status: 'active', account: B };
    const { handleWebsiteMessage } = await load();
    await handleWebsiteMessage({ type: 'jlog:key', accountId: A.id, key: 'key-a' });
    await handleWebsiteMessage({ type: 'jlog:key', accountId: B.id, key: 'key-b' });
    server['key-a'] = { status: 'expired' };

    expect(await handleWebsiteMessage({ type: 'jlog:signed-in', accountId: A.id })).toEqual({
      status: 'needs-key',
    });
  });
});

describe('a key from jlog.ai', () => {
  it('is refused when it belongs to a different account than the one named', async () => {
    server['key-a'] = { status: 'active', account: A };
    const { handleWebsiteMessage } = await load();
    expect(await handleWebsiteMessage({ type: 'jlog:key', accountId: B.id, key: 'key-a' })).toEqual(
      { status: 'rejected' },
    );
  });
});

describe('signing out on jlog.ai', () => {
  it('disconnects the extension but keeps the key for when that account signs in again', async () => {
    server['key-a'] = { status: 'active', account: A };
    const { handleWebsiteMessage } = await load();
    await handleWebsiteMessage({ type: 'jlog:key', accountId: A.id, key: 'key-a' });

    expect(await handleWebsiteMessage({ type: 'jlog:signed-out' })).toEqual({
      status: 'disconnected',
    });
    expect(storage.jlog_token).toBeUndefined();
    expect(await handleWebsiteMessage({ type: 'jlog:signed-in', accountId: A.id })).toEqual({
      status: 'connected',
    });
  });
});

describe('anything else', () => {
  it('is ignored', async () => {
    const { handleWebsiteMessage } = await load();
    expect(await handleWebsiteMessage({ type: 'jlog:key', accountId: A.id })).toEqual({
      status: 'ignored',
    });
    expect(await handleWebsiteMessage('hello')).toEqual({ status: 'ignored' });
  });
});
