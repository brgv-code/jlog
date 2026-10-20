/**
 * The stored facts every tailored CV is built from, as the CV page shows them.
 *
 * They were only ever visible during an import's review step and inside a
 * tailored CV, so what was actually stored, including what older AI tailored
 * applications had added, could not be seen or corrected anywhere.
 */
import { apiFetch } from './api';

/**
 * cv: from a CV imported here. edited: corrected by the owner. added: written
 * by the owner on the CV page. kept: from older applications, and kept by the
 * owner. history: from older applications and not kept yet, which tailoring
 * does not use.
 */
export type FactOrigin = 'cv' | 'edited' | 'added' | 'kept' | 'history';
export type FactStatus = 'active' | 'archived';

export type StoredBullet = { id: string; text: string; status: FactStatus; origin: FactOrigin };

export type StoredRole = {
  id: string;
  employer: string | null;
  roleTitle: string | null;
  dates: string | null;
  location: string | null;
  status: FactStatus;
  origin: 'cv' | 'history';
  /** Active bullets under this role that tailoring is not using yet. */
  unconfirmed: number;
  bullets: StoredBullet[];
};

export type StoredFacts = {
  roles: StoredRole[];
  orphans: StoredBullet[];
  /** The latest imported CV's layout: its roles and their bullets, in order. */
  base?: { roleId: string; bulletIds: string[] }[];
};

/** The most recently tailored CV, and which application it was for. */
export type LatestTailored = {
  selected: {
    roleFactId: string;
    employer: string | null;
    roleTitle: string | null;
    dates: string | null;
    bullets: { factId: string; text: string }[];
  }[];
  application: { id: string; company: string; role: string };
  savedAt: string;
};

export async function loadLatestTailored(): Promise<LatestTailored | null> {
  const res = await apiFetch('/api/profile/latest-tailored').catch(() => null);
  if (!res?.ok) return null;
  const body = (await res.json()) as { tailored: LatestTailored | null };
  return body.tailored;
}

/** Fired after an import, so the list shows what was just stored. */
export const FACTS_CHANGED = 'jlog:facts-changed';

export function notifyFactsChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(FACTS_CHANGED));
}

export async function loadStoredFacts(): Promise<StoredFacts | null> {
  const res = await apiFetch('/api/profile/facts?include=archived').catch(() => null);
  if (!res?.ok) return null;
  return (await res.json()) as StoredFacts;
}

export async function updateFact(
  id: string,
  change: { status?: FactStatus; canonical?: string; confirmed?: boolean },
): Promise<boolean> {
  const res = await apiFetch(`/api/profile/facts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(change),
  }).catch(() => null);
  return Boolean(res?.ok);
}

/** Add a bullet under a role, in the owner's own words. Null when it failed. */
export async function addBullet(roleId: string, text: string): Promise<StoredBullet | null> {
  const res = await apiFetch('/api/profile/facts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ parentFactId: roleId, canonical: text }),
  }).catch(() => null);
  if (!res?.ok) return null;
  return (await res.json()) as StoredBullet;
}

export const ORIGIN_LABELS: Record<FactOrigin, string> = {
  cv: 'From your CV',
  edited: 'Edited by you',
  added: 'Added by you',
  kept: 'Kept by you',
  history: 'Unconfirmed: not used',
};

/** The end of a "2023--2025" or "2025--current" range, as a sortable number. */
function endYear(dates: string | null): number {
  if (!dates) return -1;
  if (/current|present|ongoing|now/i.test(dates)) return Number.POSITIVE_INFINITY;
  const years = dates.match(/(?:19|20)\d{2}/g) ?? [];
  return years.length ? Number(years[years.length - 1]) : -1;
}

/** Most recent first, the way a CV reads; ties by employer so the order is stable. */
export function sortRoles(roles: StoredRole[]): StoredRole[] {
  return [...roles].sort(
    (a, b) =>
      endYear(b.dates) - endYear(a.dates) || (a.employer ?? '').localeCompare(b.employer ?? ''),
  );
}

/** Count of what the "show archived" toggle would reveal. */
export function archivedCount(facts: StoredFacts): number {
  return facts.roles.reduce(
    (n, role) =>
      n +
      (role.status === 'archived' ? 1 : 0) +
      role.bullets.filter((b) => b.status === 'archived').length,
    0,
  );
}
