import { type AuthProviderAvailability, authProvidersResponseSchema } from '@jlog/shared';
import { type CSSProperties, type FormEvent, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';

/**
 * The sign-in card.
 *
 * Which buttons appear is decided by the server, not by this file: an instance
 * with no Google credentials and no mail domain offers GitHub alone, and a
 * self-hoster should not have to see three buttons that cannot work. So the
 * first thing this does is ask.
 */

type Availability = AuthProviderAvailability;

type Status =
  | { state: 'loading' }
  | { state: 'ready'; providers: Availability }
  // Reached when the API is unreachable. GitHub is assumed rather than showing
  // an empty card, since it is the one method every instance is expected to have.
  | { state: 'offline' };

/**
 * Failures come back here as a query parameter rather than as a page of JSON,
 * because everything in an OAuth round trip happens inside a navigation the
 * person is watching.
 */
const ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'You cancelled the sign-in. No harm done — try again when ready.',
  invalid_token: 'That sign-in link has already been used, or it expired. Ask for a new one.',
  unable_to_create_user: "We couldn't create an account for you. Try a different sign-in method.",
  account_not_linked:
    'That email already belongs to an account created with a different sign-in method. ' +
    'Use the method you signed up with, and you can add this one afterwards.',
  please_restart_the_process: 'The sign-in timed out. Please try again.',
};

function friendlyError(code: string | null): string | null {
  if (!code) return null;
  return ERROR_MESSAGES[code] ?? 'Something went wrong signing you in. Please try again.';
}

const card: CSSProperties = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-xl)',
  padding: 'var(--space-12) var(--space-8)',
  width: '100%',
  maxWidth: 400,
  textAlign: 'center',
  boxShadow: 'var(--shadow-lg)',
};

const providerButton: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--space-3)',
  background: 'var(--color-surface)',
  color: 'var(--color-text-primary)',
  border: '1px solid var(--color-border)',
  fontSize: 'var(--text-sm)',
  fontWeight: 600,
  padding: 'var(--space-3) var(--space-6)',
  borderRadius: 'var(--radius-md)',
  width: '100%',
  cursor: 'pointer',
  transition: 'background var(--transition-fast)',
};

const primaryButton: CSSProperties = {
  ...providerButton,
  background: 'var(--color-primary)',
  color: 'var(--color-primary-fg)',
  borderColor: 'transparent',
};

export default function LoginPanel() {
  const [status, setStatus] = useState<Status>({ state: 'loading' });
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyProvider, setBusyProvider] = useState<string | null>(null);

  useEffect(() => {
    // A failed round trip lands back here carrying its reason.
    const reason = new URLSearchParams(window.location.search).get('error');
    setError(friendlyError(reason));

    apiFetch('/api/auth/providers')
      .then(async (res) => {
        if (!res.ok) throw new Error('unavailable');
        // Parsed rather than cast: an older API that does not know about this
        // endpoint would otherwise hand back something shaped wrong and the
        // card would render no buttons at all, silently.
        const body = authProvidersResponseSchema.parse(await res.json());
        setStatus({ state: 'ready', providers: body.providers });
      })
      .catch(() => setStatus({ state: 'offline' }));
  }, []);

  /**
   * Hand off to a provider.
   *
   * Better Auth answers with the URL to send the browser to rather than
   * redirecting the fetch itself, because a redirect followed by fetch would
   * navigate nothing.
   */
  async function signInWith(provider: 'github' | 'google' | 'apple') {
    setError(null);
    setBusyProvider(provider);

    try {
      const res = await apiFetch('/api/auth/sign-in/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          callbackURL: `${window.location.origin}/dashboard`,
          // Without this a failure ends on Better Auth's own error page, on the
          // API's domain, which is a dead end for the person looking at it.
          errorCallbackURL: `${window.location.origin}/login`,
        }),
      });

      const body = (await res.json()) as { url?: string; message?: string };
      if (!res.ok || !body.url) {
        setError(body.message ?? 'Could not start sign-in. Please try again.');
        setBusyProvider(null);
        return;
      }

      window.location.href = body.url;
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setBusyProvider(null);
    }
  }

  async function requestMagicLink(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSending(true);

    try {
      const res = await apiFetch('/api/auth/sign-in/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          callbackURL: `${window.location.origin}/dashboard`,
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        setError(body.message ?? 'Could not send the link. Please try again.');
        return;
      }

      setSentTo(email);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setSending(false);
    }
  }

  // Assume the one method every instance is expected to have, rather than
  // showing an empty card, if the availability check could not be made.
  const providers: Availability =
    status.state === 'ready'
      ? status.providers
      : { github: true, google: false, apple: false, email: false };

  if (status.state === 'loading') {
    return (
      <div style={{ ...card, color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
        Loading sign-in options…
      </div>
    );
  }

  if (sentTo) {
    return (
      <div style={card}>
        <h1 style={headingStyle}>Check your inbox</h1>
        <p style={subheadingStyle}>
          We sent a sign-in link to{' '}
          <strong style={{ color: 'var(--color-text-primary)' }}>{sentTo}</strong>. It works once
          and expires in 15 minutes.
        </p>
        <button
          type="button"
          style={providerButton}
          onClick={() => {
            setSentTo(null);
            setEmail('');
          }}
        >
          Use a different address
        </button>
      </div>
    );
  }

  const anySocial = providers.github || providers.google || providers.apple;

  return (
    <div style={card}>
      <h1 style={headingStyle}>jlog</h1>
      <p style={subheadingStyle}>Track your job applications — open source &amp; self-hostable.</p>

      {error && (
        <p
          role="alert"
          style={{
            background: 'var(--color-danger-bg, #fef2f2)',
            color: 'var(--color-danger, #b91c1c)',
            border: '1px solid var(--color-danger-border, #fecaca)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-3)',
            fontSize: 'var(--text-sm)',
            marginBottom: 'var(--space-6)',
            textAlign: 'left',
          }}
        >
          {error}
        </p>
      )}

      <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
        {providers.github && (
          <button
            type="button"
            style={primaryButton}
            disabled={busyProvider !== null}
            onClick={() => signInWith('github')}
          >
            <GitHubMark />
            {busyProvider === 'github' ? 'Redirecting…' : 'Continue with GitHub'}
          </button>
        )}

        {providers.google && (
          <button
            type="button"
            style={providerButton}
            disabled={busyProvider !== null}
            onClick={() => signInWith('google')}
          >
            <GoogleMark />
            {busyProvider === 'google' ? 'Redirecting…' : 'Continue with Google'}
          </button>
        )}

        {providers.apple && (
          <button
            type="button"
            style={providerButton}
            disabled={busyProvider !== null}
            onClick={() => signInWith('apple')}
          >
            <AppleMark />
            {busyProvider === 'apple' ? 'Redirecting…' : 'Continue with Apple'}
          </button>
        )}
      </div>

      {providers.email && anySocial && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            margin: 'var(--space-6) 0',
            color: 'var(--color-text-secondary)',
            fontSize: 'var(--text-xs)',
          }}
        >
          <span style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
          or
          <span style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
        </div>
      )}

      {providers.email && (
        <form onSubmit={requestMagicLink} style={{ display: 'grid', gap: 'var(--space-3)' }}>
          <label htmlFor="login-email" style={{ ...srOnly }}>
            Email address
          </label>
          <input
            id="login-email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              width: '100%',
              padding: 'var(--space-3)',
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-primary)',
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
            }}
          />
          <button
            type="submit"
            style={anySocial ? providerButton : primaryButton}
            disabled={sending}
          >
            {sending ? 'Sending…' : 'Email me a sign-in link'}
          </button>
        </form>
      )}

      {!providers.email && !anySocial && (
        <p style={{ ...subheadingStyle, marginBottom: 0 }}>
          No sign-in method is configured on this instance yet.
        </p>
      )}
    </div>
  );
}

const headingStyle: CSSProperties = {
  fontSize: 'var(--text-2xl)',
  fontWeight: 700,
  color: 'var(--color-text-primary)',
  marginBottom: 'var(--space-2)',
  letterSpacing: '-0.02em',
};

const subheadingStyle: CSSProperties = {
  fontSize: 'var(--text-sm)',
  color: 'var(--color-text-secondary)',
  marginBottom: 'var(--space-8)',
  lineHeight: 1.5,
};

/** Visually hidden, but still read aloud — the input has only a placeholder. */
const srOnly: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

// Marks are inlined rather than fetched: three extra network requests on the
// one page whose whole job is to be fast would be a poor trade.
function GitHubMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0C5.37 0 0 5.373 0 12c0 5.303 3.438 9.8 8.207 11.387.6.113.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.06 12.25c0-.85-.076-1.667-.218-2.45H12v4.633h6.203a5.304 5.304 0 0 1-2.302 3.48v2.892h3.727c2.18-2.007 3.432-4.964 3.432-8.555z"
      />
      <path
        fill="#34A853"
        d="M12 23.5c3.105 0 5.71-1.03 7.613-2.788l-3.727-2.892c-1.032.69-2.353 1.098-3.886 1.098-2.987 0-5.516-2.017-6.418-4.728H1.73v2.986A11.496 11.496 0 0 0 12 23.5z"
      />
      <path
        fill="#FBBC05"
        d="M5.582 14.19a6.91 6.91 0 0 1 0-4.38V6.824H1.73a11.51 11.51 0 0 0 0 10.352l3.852-2.986z"
      />
      <path
        fill="#EA4335"
        d="M12 5.082c1.69 0 3.205.58 4.398 1.72l3.298-3.297C17.705 1.653 15.1.5 12 .5 7.552.5 3.706 3.053 1.73 6.824L5.582 9.81C6.484 7.099 9.013 5.082 12 5.082z"
      />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.05 12.66c-.03-2.74 2.24-4.06 2.34-4.12-1.28-1.87-3.26-2.12-3.96-2.15-1.69-.17-3.29 1-4.15 1-.85 0-2.17-.98-3.57-.95-1.84.03-3.53 1.07-4.48 2.71-1.91 3.32-.49 8.23 1.37 10.92.91 1.32 2 2.8 3.42 2.75 1.37-.06 1.89-.89 3.55-.89 1.65 0 2.12.89 3.57.86 1.47-.02 2.41-1.34 3.31-2.67 1.04-1.53 1.47-3.01 1.5-3.09-.03-.01-2.88-1.1-2.9-4.37zM14.6 4.44c.75-.92 1.26-2.19 1.12-3.44-1.08.04-2.4.72-3.18 1.63-.7.81-1.31 2.11-1.15 3.35 1.21.09 2.45-.62 3.21-1.54z" />
    </svg>
  );
}
