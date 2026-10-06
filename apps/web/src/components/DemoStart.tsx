import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import { JlogMark } from './ui/JlogMark';

/**
 * Opens a throwaway demo account and drops the visitor on its dashboard.
 *
 * Every visit gets its own account (see apps/api/src/lib/demo), so nothing a
 * visitor changes shows up for the next one. The account is deleted after a
 * day.
 *
 * Someone already signed in to a real account is asked first: the demo
 * session replaces theirs in this browser, and finding yourself signed out of
 * your own account because you clicked "try the demo" is a bad surprise.
 */

type State =
  | { step: 'checking' }
  | { step: 'confirm'; email: string }
  | { step: 'creating' }
  | { step: 'failed'; message: string };

export default function DemoStart() {
  const [state, setState] = useState<State>({ step: 'checking' });
  const started = useRef(false);

  const start = useCallback(async () => {
    setState({ step: 'creating' });
    try {
      const res = await apiFetch('/api/auth/demo/sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        setState({
          step: 'failed',
          message:
            res.status === 429
              ? 'A lot of people are opening the demo right now. Give it a few seconds and try again.'
              : (body.message ?? 'The demo could not be set up. Please try again.'),
        });
        return;
      }
      window.location.replace('/dashboard?welcome=1');
    } catch {
      setState({
        step: 'failed',
        message: 'Could not reach the server. Check your connection and try again.',
      });
    }
  }, []);

  useEffect(() => {
    // Strict mode runs effects twice in development; one visit is one account.
    if (started.current) return;
    started.current = true;

    apiFetch('/api/auth/me')
      .then(async (res) => {
        if (!res.ok) return start();
        const body = (await res.json()) as { user?: { email?: string; demo?: boolean } };
        // Already in a demo: carry on in it rather than minting another.
        if (body.user?.demo) {
          window.location.replace('/dashboard');
          return;
        }
        if (body.user?.email) {
          setState({ step: 'confirm', email: body.user.email });
          return;
        }
        return start();
      })
      .catch(() => start());
  }, [start]);

  if (state.step === 'confirm') {
    return (
      <div style={card}>
        <h1 style={heading}>Open the demo?</h1>
        <p style={sub}>
          You're signed in as{' '}
          <strong style={{ color: 'var(--color-text-primary)' }}>{state.email}</strong>. The demo
          signs you out of that account in this browser. Your own data is not touched, and you can
          sign back in any time.
        </p>
        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          <button type="button" style={primaryButton} onClick={start}>
            Open the demo
          </button>
          <a href="/dashboard" style={{ ...secondaryButton, textDecoration: 'none' }}>
            Back to my account
          </a>
        </div>
      </div>
    );
  }

  if (state.step === 'failed') {
    return (
      <div style={card}>
        <h1 style={heading}>The demo didn't open</h1>
        <p role="alert" style={{ ...sub, color: 'var(--color-danger)' }}>
          {state.message}
        </p>
        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          <button type="button" style={primaryButton} onClick={start}>
            Try again
          </button>
          <a href="/login" style={{ ...secondaryButton, textDecoration: 'none' }}>
            Sign in instead
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...card, display: 'grid', justifyItems: 'center', gap: 'var(--space-5)' }}>
      <JlogMark mode="think" size={52} label="Setting up the demo" />
      <div>
        <h1 style={{ ...heading, fontSize: 'var(--text-xl)' }}>Setting up the demo</h1>
        <p style={{ ...sub, marginBottom: 0 }}>
          You'll be Maya, a senior engineer in Berlin six months into her job search: around 200
          applications, an imported CV and every status in between. This takes a few seconds.
        </p>
      </div>
    </div>
  );
}

const card: CSSProperties = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-xl)',
  padding: 'var(--space-12) var(--space-8)',
  width: '100%',
  maxWidth: 440,
  textAlign: 'center',
  boxShadow: 'var(--shadow-lg)',
};

const heading: CSSProperties = {
  fontSize: 'var(--text-2xl)',
  fontWeight: 700,
  color: 'var(--color-text-primary)',
  marginBottom: 'var(--space-2)',
  letterSpacing: '-0.02em',
};

const sub: CSSProperties = {
  fontSize: 'var(--text-sm)',
  color: 'var(--color-text-secondary)',
  marginBottom: 'var(--space-8)',
  lineHeight: 1.6,
};

const secondaryButton: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--color-surface)',
  color: 'var(--color-text-primary)',
  border: '1px solid var(--color-border)',
  fontSize: 'var(--text-sm)',
  fontWeight: 600,
  padding: 'var(--space-3) var(--space-6)',
  borderRadius: 'var(--radius-md)',
  width: '100%',
  cursor: 'pointer',
};

const primaryButton: CSSProperties = {
  ...secondaryButton,
  background: 'var(--color-primary)',
  color: 'var(--color-primary-fg)',
  borderColor: 'transparent',
};
