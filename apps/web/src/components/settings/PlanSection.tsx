import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { useBillingEnabled } from '../../lib/billing';
import { Spinner } from '../ui/Spinner';
import { Button } from '../ui/button';

/**
 * Plan and billing (ADR-011).
 *
 * Owns its whole section rather than just the controls, because it is the one
 * section that can be absent: a self-hoster has no Stripe account, and showing
 * them a paywall they cannot cross — on software they are running
 * themselves — would be an advert, not a feature.
 */

type Props = {
  plan: 'free' | 'pro';
  planSource: 'stripe' | 'manual' | null;
  planStatus: string | null;
  currentPeriodEnd: string | null;
  /** Re-reads /api/auth/me once the plan may have changed. */
  onRefresh: () => Promise<void>;
};

const sectionStyle = {
  display: 'grid',
  gap: 'var(--space-4)',
  paddingBottom: 'var(--space-10)',
  marginBottom: 'var(--space-10)',
  borderBottom: '1px solid var(--color-border)',
} as const;

const headingStyle = {
  fontSize: 'var(--text-sm)',
  fontWeight: 600,
  color: 'var(--color-text-primary)',
  letterSpacing: '-0.01em',
} as const;

const helpStyle = {
  fontSize: 'var(--text-sm)',
  color: 'var(--color-text-secondary)',
  lineHeight: 1.6,
  maxWidth: '62ch',
} as const;

const noteStyle = {
  fontSize: 'var(--text-xs)',
  color: 'var(--color-text-tertiary)',
} as const;

/** How long to keep asking after a checkout before admitting nothing arrived. */
const SETTLE_TIMEOUT_MS = 30_000;
const SETTLE_INTERVAL_MS = 1_500;

function formatRenewal(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

export function PlanSection({ plan, planSource, planStatus, currentPeriodEnd, onRefresh }: Props) {
  const enabled = useBillingEnabled();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Checkout redirects back the moment Stripe is done, which is a race the
   * webhook usually but not always wins. Without this the page says "Free" to
   * someone who has just paid, which reads as the payment having failed.
   */
  const [settling, setSettling] = useState(false);
  const settledRef = useRef(false);

  useEffect(() => {
    if (settledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    if (!params.has('upgraded')) return;
    settledRef.current = true;

    // Drop the flag so a refresh does not re-enter this.
    params.delete('upgraded');
    const q = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${q ? `?${q}` : ''}`);

    if (plan === 'pro') return;

    setSettling(true);
    const startedAt = Date.now();
    const tick = async () => {
      await onRefresh();
      if (Date.now() - startedAt > SETTLE_TIMEOUT_MS) {
        clearInterval(timer);
        setSettling(false);
        setError('Payment went through, but the upgrade has not arrived yet. Reload in a minute.');
      }
    };
    const timer = setInterval(tick, SETTLE_INTERVAL_MS);
    void tick();
    return () => clearInterval(timer);
  }, [plan, onRefresh]);

  useEffect(() => {
    if (plan === 'pro' && settling) {
      setSettling(false);
      setError(null);
    }
  }, [plan, settling]);

  async function go(path: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(path, { method: 'POST' });
      const body = (await res.json()) as { url?: string; error?: { message?: string } };
      if (!res.ok || !body.url) {
        setError(body.error?.message ?? 'Could not reach Stripe. Try again in a moment.');
        setBusy(false);
        return;
      }
      window.location.href = body.url;
    } catch {
      setError('Could not reach Stripe. Try again in a moment.');
      setBusy(false);
    }
  }

  // Render the shell before the data (rule 4) — but not a section that may turn
  // out not to exist, which would shift the page under the reader.
  if (enabled === null || enabled === false) return null;

  const renewal = formatRenewal(currentPeriodEnd);
  const comped = plan === 'pro' && planSource === 'manual';
  const subscribed = plan === 'pro' && planSource !== 'manual';

  return (
    <section style={sectionStyle}>
      <p style={headingStyle}>Plan</p>

      {plan === 'free' && (
        <>
          <p style={helpStyle}>
            Tracking, capture and extraction are free and always will be. Pro adds tailored CV and
            cover letter generation: a job-specific document built from your own stored facts, and
            compiled to PDF.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <Button
              size="sm"
              onClick={() => go('/api/billing/checkout')}
              disabled={busy || settling}
            >
              {busy ? 'Opening Stripe…' : 'Upgrade to Pro'}
            </Button>
            {settling && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  ...noteStyle,
                }}
              >
                <Spinner size={14} />
                Confirming your payment…
              </span>
            )}
          </div>
          <p style={noteStyle}>Cancel any time. Billing is handled by Stripe.</p>
        </>
      )}

      {subscribed && (
        <>
          <p style={helpStyle}>
            You are on <strong>Pro</strong>
            {planStatus === 'past_due' ? (
              <>
                , and your last payment did not go through. Access continues for now — update your
                card to keep it.
              </>
            ) : renewal ? (
              <> — renews {renewal}.</>
            ) : (
              <>.</>
            )}
          </p>
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => go('/api/billing/portal')}
              disabled={busy}
            >
              {busy ? 'Opening Stripe…' : 'Manage billing'}
            </Button>
          </div>
          <p style={noteStyle}>
            Invoices, card changes and cancellation all live in Stripe's portal.
          </p>
        </>
      )}

      {comped && (
        <>
          <p style={helpStyle}>
            You are on <strong>Pro</strong>, complimentary. There is no subscription attached to
            this account and nothing to pay.
          </p>
          <p style={noteStyle}>Granted manually, so it is not affected by billing.</p>
        </>
      )}

      {error && (
        <p
          style={{ ...noteStyle, color: 'var(--color-status-rejected, var(--color-text-primary))' }}
        >
          {error}
        </p>
      )}
    </section>
  );
}
