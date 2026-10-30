import type { FirstTouch } from '@jlog/shared';
import { apiFetch } from './api';

/**
 * The browser's memory of its first jlog page (growth experiment E01).
 *
 * Written once, on the first page this browser ever opens here, and sent once,
 * from the first signed-in page. It never leaves the browser for someone who
 * does not sign up. Only the referring site's host is kept, never the page it
 * linked from.
 */

const KEY = 'jlog_first_touch';

interface Stored extends FirstTouch {
  /** Set once the API has answered, so it is sent at most once. */
  sent?: boolean;
}

/**
 * Hosts that send people back here mid sign-in. Seen as a referrer only when
 * a browser's first stored page view is the return from one of them, and then
 * they say nothing about how the person found jlog.
 */
const SIGN_IN_HOSTS = ['accounts.google.com', 'appleid.apple.com'];

function read(): Stored | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

function write(value: Stored): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Storage blocked or full. The visit simply goes unattributed.
  }
}

/**
 * The referrer's host if it is another site, else null. jlog's own pages and
 * the API (api.jlog.ai) are not a source.
 */
function externalReferrerHost(referrer: string, ownHost: string): string | null {
  if (!referrer) return null;
  try {
    const host = new URL(referrer).hostname.toLowerCase();
    const own = ownHost.toLowerCase().replace(/^www\./, '');
    if (host === own || host.endsWith(`.${own}`)) return null;
    if (SIGN_IN_HOSTS.includes(host)) return null;
    return host;
  } catch {
    return null;
  }
}

/** Remember this page view as the first touch, unless one is already stored. */
export function rememberFirstTouch(): void {
  if (read()) return;
  const params = new URLSearchParams(window.location.search);
  write({
    referrerHost: externalReferrerHost(document.referrer, window.location.hostname),
    utmSource: params.get('utm_source'),
    utmMedium: params.get('utm_medium'),
    utmCampaign: params.get('utm_campaign'),
    landingPath: window.location.pathname,
    firstSeenAt: Date.now(),
  });
}

/**
 * Hand the first touch to the API. Call only when signed in. A failed request
 * leaves it unsent, to try again on the next page; any answer from the API,
 * including "too late to count", marks it sent.
 */
export async function sendFirstTouch(): Promise<void> {
  const stored = read();
  if (!stored || stored.sent) return;
  const { sent: _sent, ...touch } = stored;
  try {
    const res = await apiFetch('/api/attribution/first-touch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(touch),
    });
    if (res.ok) write({ ...stored, sent: true });
  } catch {
    // Offline or blocked. Next signed-in page tries again.
  }
}
