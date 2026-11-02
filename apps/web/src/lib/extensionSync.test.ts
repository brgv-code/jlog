import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EXTENSION_IDS } from '../data/extension';

const sent: [string, unknown][] = [];
let replies: Record<string, unknown>;
const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('./api', () => ({ apiFetch }));

beforeEach(() => {
  sent.length = 0;
  replies = {};
  apiFetch.mockReset();
  const runtime = {
    lastError: undefined as { message: string } | undefined,
    sendMessage: (id: string, message: { type: string }, reply: (r: unknown) => void) => {
      sent.push([id, message]);
      // Only the store build is "installed" in these tests.
      if (id !== EXTENSION_IDS[0]) {
        runtime.lastError = { message: 'Could not establish connection.' };
        reply(undefined);
        runtime.lastError = undefined;
        return;
      }
      reply(replies[message.type] ?? { status: 'ignored' });
    },
  };
  vi.stubGlobal('window', { chrome: { runtime } });
});

describe('connectExtension', () => {
  it('creates a key and hands it over when the extension has none for this account', async () => {
    replies['jlog:signed-in'] = { status: 'needs-key' };
    apiFetch.mockResolvedValue(new Response(JSON.stringify({ token: 'new-key' })));
    const { connectExtension } = await import('./extensionSync');

    await connectExtension({ id: 'acct-b' });

    expect(apiFetch).toHaveBeenCalledWith('/api/extension/token', expect.anything());
    expect(sent).toContainEqual([
      EXTENSION_IDS[0],
      { type: 'jlog:key', accountId: 'acct-b', key: 'new-key' },
    ]);
  });

  it('creates nothing when the extension is already connected', async () => {
    replies['jlog:signed-in'] = { status: 'connected' };
    const { connectExtension } = await import('./extensionSync');
    await connectExtension({ id: 'acct-b' });
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('leaves the extension alone for a demo account', async () => {
    const { connectExtension } = await import('./extensionSync');
    await connectExtension({ id: 'demo-1', demo: true });
    expect(sent).toEqual([]);
  });

  it('does nothing in a browser with no jlog extension', async () => {
    vi.stubGlobal('window', {});
    const { connectExtension } = await import('./extensionSync');
    await connectExtension({ id: 'acct-b' });
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
