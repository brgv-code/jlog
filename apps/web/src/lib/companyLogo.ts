import { useEffect, useState } from 'react';
import { apiFetch } from './api';

/**
 * Company logos on the client.
 *
 * The endpoint needs the session cookie, so it cannot be an <img src> straight
 * to the API on a cross-origin deployment. Fetched as a blob instead, and
 * memoised per company for the life of the page — a list of fifty applications
 * is usually far fewer than fifty distinct employers, and without this each row
 * would fetch its own copy.
 *
 * `null` is a cached answer, not an absence: most companies will never resolve,
 * and re-asking on every render is exactly what the server's negative cache
 * exists to prevent.
 */
const cache = new Map<string, Promise<string | null>>();

function fetchLogo(company: string): Promise<string | null> {
  const existing = cache.get(company);
  if (existing) return existing;

  const pending = apiFetch(`/api/company-logo?company=${encodeURIComponent(company)}`)
    .then(async (res) => (res.ok ? URL.createObjectURL(await res.blob()) : null))
    .catch(() => null);

  cache.set(company, pending);
  return pending;
}

/**
 * `enabled` exists for the signed-out landing page, which renders the real
 * applications table against fixtures. The endpoint needs a session, so leaving
 * this on there would fire a cross-origin request per employer, collect a 401
 * for each, and fall back to the monogram it could have drawn immediately.
 */
export function useCompanyLogo(company: string, enabled = true): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    fetchLogo(company).then((next) => {
      if (live) setUrl(next);
    });
    return () => {
      live = false;
    };
    // Blob URLs are deliberately not revoked: they are shared through the
    // module cache, so revoking on unmount would break every other row showing
    // the same employer. They live until the page does.
  }, [company, enabled]);

  return url;
}
