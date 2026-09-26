import type { RecentActivity } from '../types';

/**
 * The last few tracked jobs, plus this week's count, for the popup's idle
 * screen. Both endpoints already accept an extension key, so this needs no new
 * server route.
 *
 * The API caller is injected rather than reached for, so this can be driven
 * against stubbed responses. That matters more than it looks: every failure
 * here is deliberately soft — the idle screen has a fallback that needs no data
 * at all, and a slow or unreachable API should quietly land on it rather than
 * turn "nothing to track on this page" into an error. The cost of that choice
 * is that a change to either response shape would also land on the fallback,
 * silently hiding real history with nothing failing anywhere. The tests beside
 * this file are what makes that noticeable.
 */
export async function loadRecentActivity(
  call: (path: string) => Promise<Response>,
): Promise<RecentActivity | null> {
  try {
    const [listRes, statsRes] = await Promise.all([
      call('/api/applications?limit=3'),
      call('/api/stats'),
    ]);
    if (!listRes.ok || !statsRes.ok) return null;

    const list = (await listRes.json()) as {
      applications?: {
        id: string;
        company: string;
        role: string;
        status: string;
        createdAt: string | null;
      }[];
      total?: number;
    };
    const stats = (await statsRes.json()) as { thisWeek?: number; total?: number };

    return {
      items: (list.applications ?? []).map((a) => ({
        id: a.id,
        company: a.company,
        role: a.role,
        status: a.status,
        // Epoch ms for the popup, which formats it as "2h ago". An unparseable
        // date becomes null rather than NaN, so the row drops its timestamp
        // instead of rendering "NaN ago".
        createdAt: toEpochMs(a.createdAt),
      })),
      thisWeek: stats.thisWeek ?? 0,
      // The list endpoint carries a total too; either will do, and having a
      // second source means a change to one does not zero the count.
      total: stats.total ?? list.total ?? 0,
    };
  } catch {
    return null;
  }
}

function toEpochMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}
