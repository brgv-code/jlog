import { useEffect, useState } from 'react';
import { apiFetch } from './api';

/**
 * Whether this deployment can sell anything (ADR-011).
 *
 * `null` while unknown, so a caller can render nothing rather than flash an
 * upgrade path that turns out not to exist. A self-hoster has no Stripe
 * account, and pointing them at a paywall they cannot cross — on software they
 * are running themselves — is an advert, not a feature.
 */
export function useBillingEnabled(): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    apiFetch('/api/billing/config')
      .then(async (res) => {
        const ok = res.ok ? ((await res.json()) as { enabled: boolean }).enabled : false;
        if (live) setEnabled(ok);
      })
      .catch(() => {
        if (live) setEnabled(false);
      });
    return () => {
      live = false;
    };
  }, []);

  return enabled;
}
