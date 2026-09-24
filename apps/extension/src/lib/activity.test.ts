import { describe, expect, it, vi } from 'vitest';
import { loadRecentActivity } from './activity';

/**
 * The popup's idle screen falls back to a static list of supported sites
 * whenever activity cannot be loaded, and that fallback looks perfectly
 * healthy. So a change to either response shape would hide someone's real
 * history behind it with nothing failing anywhere — which is exactly what
 * these cover.
 */

const ok = (body: unknown): Response =>
  ({ ok: true, json: () => Promise.resolve(body) }) as Response;

const fail = (status = 500): Response =>
  ({ ok: false, status, json: () => Promise.resolve({}) }) as Response;

/** Answers each path from a map, so a test only states what it cares about. */
function caller(routes: Record<string, Response | (() => Promise<Response>)>) {
  return vi.fn((path: string) => {
    const key = Object.keys(routes).find((k) => path.startsWith(k));
    if (!key) throw new Error(`unexpected path: ${path}`);
    const hit = routes[key];
    return typeof hit === 'function' ? hit() : Promise.resolve(hit as Response);
  });
}

const LIST = '/api/applications';
const STATS = '/api/stats';

describe('loadRecentActivity', () => {
  it('maps the two responses the popup actually renders', async () => {
    const call = caller({
      [LIST]: ok({
        applications: [
          {
            id: 'a1',
            company: 'Staffbase',
            role: 'Staff Engineer',
            status: 'applied',
            createdAt: '2026-09-24T12:00:00.000Z',
          },
        ],
        total: 31,
      }),
      [STATS]: ok({ thisWeek: 4, total: 31 }),
    });

    const activity = await loadRecentActivity(call);

    expect(activity).not.toBeNull();
    expect(activity?.thisWeek).toBe(4);
    expect(activity?.total).toBe(31);
    expect(activity?.items).toHaveLength(1);
    expect(activity?.items[0]).toEqual({
      id: 'a1',
      company: 'Staffbase',
      role: 'Staff Engineer',
      status: 'applied',
      // Epoch ms, because the popup renders this as "2h ago".
      createdAt: Date.parse('2026-09-24T12:00:00.000Z'),
    });
  });

  it('asks for only the three rows the popup has room for', async () => {
    const call = caller({ [LIST]: ok({ applications: [] }), [STATS]: ok({}) });
    await loadRecentActivity(call);
    expect(call).toHaveBeenCalledWith('/api/applications?limit=3');
    expect(call).toHaveBeenCalledWith('/api/stats');
  });

  it('falls back when the list request fails', async () => {
    const call = caller({ [LIST]: fail(401), [STATS]: ok({ thisWeek: 4 }) });
    expect(await loadRecentActivity(call)).toBeNull();
  });

  it('falls back when the stats request fails', async () => {
    const call = caller({ [LIST]: ok({ applications: [] }), [STATS]: fail(500) });
    expect(await loadRecentActivity(call)).toBeNull();
  });

  it('falls back when the network throws rather than answering', async () => {
    const call = caller({
      [LIST]: () => Promise.reject(new Error('offline')),
      [STATS]: ok({}),
    });
    expect(await loadRecentActivity(call)).toBeNull();
  });

  it('survives a response that is missing the fields it wants', async () => {
    // Not hypothetical: an older API, or a shape change, lands here. The screen
    // should degrade to zeroes rather than throw and take the popup with it.
    const call = caller({ [LIST]: ok({}), [STATS]: ok({}) });
    const activity = await loadRecentActivity(call);
    expect(activity).toEqual({ items: [], thisWeek: 0, total: 0 });
  });

  it('keeps a row whose date is missing or unparseable, without a timestamp', async () => {
    // "NaN ago" is worse than no date at all.
    const call = caller({
      [LIST]: ok({
        applications: [
          { id: 'a1', company: 'Linear', role: 'PE', status: 'saved', createdAt: null },
          { id: 'a2', company: 'Vercel', role: 'DX', status: 'saved', createdAt: 'not-a-date' },
        ],
      }),
      [STATS]: ok({ thisWeek: 2 }),
    });

    const activity = await loadRecentActivity(call);
    expect(activity?.items.map((i) => i.createdAt)).toEqual([null, null]);
    expect(activity?.items.map((i) => i.company)).toEqual(['Linear', 'Vercel']);
  });

  it('falls back to the list total when stats does not carry one', async () => {
    const call = caller({
      [LIST]: ok({ applications: [], total: 12 }),
      [STATS]: ok({ thisWeek: 0 }),
    });
    expect((await loadRecentActivity(call))?.total).toBe(12);
  });
});
