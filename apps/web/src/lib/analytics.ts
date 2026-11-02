import posthog from 'posthog-js';
import { apiFetch } from './api';

// Unset (local, self-hosted) means no banner and nothing loaded.
const KEY = import.meta.env.PUBLIC_POSTHOG_KEY as string | undefined;
const HOST =
  (import.meta.env.PUBLIC_POSTHOG_HOST as string | undefined) ?? 'https://eu.i.posthog.com';

const CONSENT_KEY = 'jlog_analytics_consent';
export const CONSENT_CHANGED = 'jlog:consent-changed';
export const CONSENT_OPEN = 'jlog:consent-open';

export type Consent = 'granted' | 'denied';

export const analyticsAvailable = Boolean(KEY);

let started = false;

export function storedConsent(): Consent | null {
  try {
    const value = localStorage.getItem(CONSENT_KEY);
    return value === 'granted' || value === 'denied' ? value : null;
  } catch {
    // Storage blocked: treated as never asked, so nothing loads.
    return null;
  }
}

function storeConsent(consent: Consent): void {
  try {
    localStorage.setItem(CONSENT_KEY, consent);
  } catch {
    // Storage blocked: the choice holds for this page only, and the banner asks again next time.
  }
  window.dispatchEvent(new Event(CONSENT_CHANGED));
}

function apiHostname(): string[] {
  try {
    return [new URL(import.meta.env.PUBLIC_API_URL as string).hostname];
  } catch {
    // No API URL configured: server events simply go without the session link.
    return [];
  }
}

/** Loads PostHog only after an explicit yes; before that nothing is fetched or stored. */
export function startAnalytics(): void {
  if (!KEY || started || storedConsent() !== 'granted') return;
  started = true;
  posthog.init(KEY, {
    api_host: HOST,
    defaults: '2026-08-30',
    person_profiles: 'identified_only',
    // A job search is personal: record clicks and page structure, never what is written or pictured.
    mask_all_text: true,
    mask_all_element_attributes: true,
    session_recording: { maskAllInputs: true, maskTextSelector: '*', blockSelector: 'img' },
    capture_exceptions: true,
    tracing_headers: apiHostname(),
  });
}

async function saveToAccount(consent: Consent): Promise<void> {
  await apiFetch('/api/settings/analytics-consent', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ granted: consent === 'granted' }),
  }).catch(() => undefined); // Signed out or offline: linkAccount saves it on the next signed-in page.
}

export function setConsent(consent: Consent): void {
  storeConsent(consent);
  void saveToAccount(consent);
  if (consent === 'granted') {
    startAnalytics();
    // Clears an earlier opt out that posthog-js keeps in this browser.
    if (started) posthog.opt_in_capturing();
  } else if (started) {
    posthog.opt_out_capturing();
  }
}

export function openConsentBanner(): void {
  window.dispatchEvent(new Event(CONSENT_OPEN));
}

/** Every signed-in page: carries the choice between this browser and the account, then links the two. */
export function linkAccount(user: {
  id?: string;
  email: string;
  demo?: boolean;
  analyticsConsent?: boolean | null;
}): void {
  const local = storedConsent();
  const account =
    user.analyticsConsent == null ? null : user.analyticsConsent ? 'granted' : 'denied';

  if (!local && account) {
    storeConsent(account);
    startAnalytics();
  } else if (local && local !== account) {
    void saveToAccount(local);
  }

  if (started && user.id) {
    posthog.identify(user.id, { email: user.email, demo: Boolean(user.demo) });
  }
}

export function resetAnalytics(): void {
  if (started) posthog.reset();
}

export function capture(
  event: string,
  properties?: Record<string, string | number | boolean>,
): void {
  if (started) posthog.capture(event, properties);
}
