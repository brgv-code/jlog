import { companyLogos, createDb } from '@jlog/db';
import { eq } from 'drizzle-orm';

/**
 * Company logos, fetched once and shared by every user.
 *
 * The hard part is never the fetching, it is knowing what to fetch. An
 * application's `source_url` is the job board, not the employer, and a company
 * name does not yield a domain — "Linear" is not linear.com. So the URL is
 * captured where it is actually knowable: by the extension, on the posting page,
 * where the board has already rendered the employer's logo.
 *
 * Deliberately not using a third-party logo service. Clearbit's is no longer
 * freely available, and Google's favicon endpoint would send every company a
 * user tracks to a third party — the wrong trade for a self-hostable tool.
 */

const MAX_LOGO_BYTES = 256_000;
const FETCH_TIMEOUT_MS = 5_000;

/** Image types worth storing. SVG is excluded: it is a script vector. */
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/**
 * The cache key. "Stripe", "Stripe Inc." and "stripe " must not become three
 * rows, or the shared cache shares nothing.
 *
 * Kept in lockstep with the comment on the migration — if this changes, old
 * rows key differently and quietly stop being found.
 */
export function normaliseCompany(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      // Legal suffixes carry no identity: people write them inconsistently.
      .replace(/\b(inc|llc|ltd|limited|gmbh|bv|nv|ag|sa|srl|plc|corp|corporation|co)\b\.?/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, '-')
  );
}

/**
 * Only fetch what a browser would have fetched anyway, over https, from a
 * public host. Workers cannot reach private address space, but an explicit
 * check keeps the intent legible and survives a move off Workers.
 */
function isFetchableLogoUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (!url.hostname.includes('.')) return false;
  if (/^(localhost|\[?::1\]?|10\.|127\.|192\.168\.|169\.254\.)/i.test(url.hostname)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname)) return false;
  return true;
}

interface Env {
  DB: D1Database;
  CV_FILES?: R2Bucket;
}

export interface LogoRecord {
  r2Key: string | null;
  contentType: string | null;
  missing: boolean;
}

/** What the cache already knows, without fetching anything. */
export async function lookupLogo(env: Env, company: string): Promise<LogoRecord | null> {
  const db = createDb(env.DB);
  const [row] = await db
    .select({
      r2Key: companyLogos.r2Key,
      contentType: companyLogos.contentType,
      missing: companyLogos.missing,
    })
    .from(companyLogos)
    .where(eq(companyLogos.companyKey, normaliseCompany(company)));
  return row ?? null;
}

/**
 * Resolve and store a logo, once, for everyone.
 *
 * Returns quietly on every failure path: a missing logo is a cosmetic gap that
 * falls back to the monogram, and it must never fail the request that triggered
 * it — creating an application matters, decorating it does not.
 */
export async function cacheLogo(env: Env, company: string, logoUrl: string): Promise<void> {
  const key = normaliseCompany(company);
  if (!key || !isFetchableLogoUrl(logoUrl)) return;

  const bucket = env.CV_FILES;
  if (!bucket) return;

  const db = createDb(env.DB);
  const existing = await lookupLogo(env, company);
  // Already answered, either way. The negative answer counts as an answer.
  if (existing) return;

  const now = new Date();
  const recordMissing = () =>
    db
      .insert(companyLogos)
      .values({
        companyKey: key,
        displayName: company,
        missing: true,
        sourceUrl: logoUrl,
        fetchedAt: now,
      })
      .onConflictDoNothing();

  let res: Response;
  try {
    res = await fetch(logoUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: 'image/*' },
    });
  } catch {
    await recordMissing();
    return;
  }

  const contentType = (res.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? '';
  if (!res.ok || !ALLOWED.has(contentType)) {
    await recordMissing();
    return;
  }

  const body = await res.arrayBuffer().catch(() => null);
  if (!body || body.byteLength === 0 || body.byteLength > MAX_LOGO_BYTES) {
    await recordMissing();
    return;
  }

  const r2Key = `logo/${key}.${EXT[contentType]}`;
  await bucket.put(r2Key, body, { httpMetadata: { contentType } });
  await db
    .insert(companyLogos)
    .values({
      companyKey: key,
      displayName: company,
      r2Key,
      contentType,
      bytes: body.byteLength,
      sourceUrl: logoUrl,
      missing: false,
      fetchedAt: now,
    })
    .onConflictDoNothing();
}
