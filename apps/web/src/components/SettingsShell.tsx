import { ArrowRightIcon, SettingsIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import { Sidebar } from './Sidebar';
import { LLMConfigForm } from './settings/LLMConfigForm';
import { Spinner } from './ui/Spinner';
import { ThemeSegmented } from './ui/ThemeSegmented';
import { Button } from './ui/button';

interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

type AuthState =
  | { status: 'loading' }
  | { status: 'authenticated'; user: User }
  | { status: 'unauthenticated' };

type ExtensionTokenState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'shown'; token: string }
  | { status: 'hidden' };

export default function SettingsShell() {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' });
  const [extToken, setExtToken] = useState<ExtensionTokenState>({ status: 'idle' });
  const [analyticsOptIn, setAnalyticsOptIn] = useState(false);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const tokenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    apiFetch('/api/auth/me')
      .then(async (res) => {
        if (res.status === 401) {
          setAuth({ status: 'unauthenticated' });
          return;
        }
        if (!res.ok) {
          setAuth({ status: 'unauthenticated' });
          return;
        }
        const data = (await res.json()) as { user: User };
        setAuth({ status: 'authenticated', user: data.user });
      })
      .catch(() => setAuth({ status: 'unauthenticated' }));
  }, []);

  useEffect(() => {
    if (auth.status === 'unauthenticated') window.location.href = '/login';
  }, [auth.status]);

  useEffect(() => {
    if (auth.status !== 'authenticated') return;
    apiFetch('/api/settings')
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { analyticsOptIn: boolean };
        setAnalyticsOptIn(data.analyticsOptIn);
      })
      .catch(() => {})
      .finally(() => setAnalyticsLoading(false));
  }, [auth.status]);

  async function toggleAnalyticsOptIn(val: boolean) {
    setAnalyticsOptIn(val);
    await apiFetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analyticsOptIn: val }),
    }).catch(() => setAnalyticsOptIn(!val));
  }

  async function handleSignOut() {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  function generateExtensionToken() {
    if (tokenTimerRef.current) clearTimeout(tokenTimerRef.current);
    setExtToken({ status: 'loading' });
    apiFetch('/api/extension/token')
      .then(async (res) => {
        if (!res.ok) {
          setExtToken({ status: 'idle' });
          return;
        }
        const data = (await res.json()) as { token: string };
        setExtToken({ status: 'shown', token: data.token });
        tokenTimerRef.current = setTimeout(() => {
          setExtToken({ status: 'hidden' });
        }, 60_000);
      })
      .catch(() => setExtToken({ status: 'idle' }));
  }

  function copyToken(token: string) {
    void navigator.clipboard.writeText(token);
  }

  if (auth.status === 'loading') {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--color-bg)',
          fontFamily: 'var(--font-sans)',
        }}
      >
        <Spinner />
      </div>
    );
  }

  if (auth.status === 'unauthenticated') return null;

  const { user } = auth;

  /*
   * Sections are separated by a hairline and a lot of air, not by cards.
   *
   * The old settings page was a stack of bordered, filled boxes, which on a
   * light ground reads as six competing panels. "Space before ornament"
   * (rule 1): drop the box, keep the gap, and the hierarchy comes from the
   * heading instead of from a border.
   */
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

  const fieldLabelStyle = {
    fontSize: 'var(--text-xs)',
    color: 'var(--color-text-secondary)',
  } as const;

  /* Mono means "this is a value you copy" (rule 8). */
  const valueStyle = {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-text-primary)',
  } as const;

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        backgroundColor: 'var(--color-bg)',
        fontFamily: 'var(--font-sans)',
        color: 'var(--color-text-primary)',
      }}
    >
      <Sidebar user={user} active="settings" onSignOut={handleSignOut} />

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header
          style={{
            height: '56px',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            padding: '0 var(--space-8)',
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-secondary)',
            }}
          >
            <SettingsIcon
              size={14}
              strokeWidth={1.75}
              style={{ color: 'var(--color-icon-settings)' }}
            />
            Settings
          </span>
        </header>

        {/*
          Centred, not left-hugged. A 680px column pinned to the left edge of a
          1200px area leaves half the screen empty on the right and reads as a
          layout that failed rather than one that chose.
        */}
        <main
          style={{
            flex: 1,
            padding: 'var(--space-6) var(--space-8) var(--space-16)',
            maxWidth: '760px',
            width: '100%',
            margin: '0 auto',
          }}
        >
          {/* Profile */}
          <section style={sectionStyle}>
            <p style={headingStyle}>Profile</p>
            <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
              <div style={{ display: 'grid', gap: 'var(--space-1)' }}>
                <span style={fieldLabelStyle}>Name</span>
                <span style={{ fontSize: 'var(--text-sm)' }}>{user.name}</span>
              </div>
              <div style={{ display: 'grid', gap: 'var(--space-1)' }}>
                <span style={fieldLabelStyle}>Email</span>
                <span style={valueStyle}>{user.email}</span>
              </div>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                Managed via GitHub.
              </p>
            </div>
          </section>

          {/* Appearance */}
          <section style={sectionStyle}>
            <p style={headingStyle}>Appearance</p>
            <p style={helpStyle}>Choose how jlog looks in your browser.</p>
            <div>
              <ThemeSegmented />
            </div>
          </section>

          {/* LLM provider */}
          <section style={sectionStyle}>
            <p style={headingStyle}>LLM provider</p>
            <p style={helpStyle}>
              The model used to extract job details from postings. API keys are encrypted at rest
              with AES-GCM and are never sent anywhere but the provider you pick.
            </p>
            <LLMConfigForm />
          </section>

          {/* Moved to its own route. A signpost stays because this is where it
              lived for long enough that people will come looking. */}
          <section style={sectionStyle}>
            <p style={headingStyle}>CV</p>
            <p style={helpStyle}>
              Your CV import and profile now have their own page, in the sidebar.
            </p>
            <div>
              <Button variant="outline" size="sm" asChild>
                <a href="/cv">
                  Open CV
                  <ArrowRightIcon size={13} strokeWidth={1.75} />
                </a>
              </Button>
            </div>
          </section>

          {/* Analytics */}
          <section style={sectionStyle}>
            <p style={headingStyle}>Analytics</p>
            <p style={helpStyle}>
              Share anonymized data — response rates, time-to-offer, ghosting patterns. No company
              names, no personal details. It is what lets jlog tell other job seekers what the
              market is actually doing.
            </p>
            {analyticsLoading ? null : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={analyticsOptIn}
                  onClick={() => toggleAnalyticsOptIn(!analyticsOptIn)}
                  style={{
                    width: '38px',
                    height: '22px',
                    borderRadius: 'var(--radius-full)',
                    border: analyticsOptIn ? 'none' : '1px solid var(--color-border-strong)',
                    backgroundColor: analyticsOptIn
                      ? 'var(--color-primary)'
                      : 'var(--color-surface-raised)',
                    cursor: 'pointer',
                    position: 'relative',
                    flexShrink: 0,
                    transition: 'background-color var(--transition-fast)',
                  }}
                  aria-label="Toggle analytics opt-in"
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: '3px',
                      left: analyticsOptIn ? '19px' : '3px',
                      width: '14px',
                      height: '14px',
                      borderRadius: '50%',
                      backgroundColor: analyticsOptIn
                        ? 'var(--color-primary-fg)'
                        : 'var(--color-text-tertiary)',
                      transition: 'left var(--transition-fast)',
                    }}
                  />
                </button>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                  {analyticsOptIn ? 'Contributing anonymized data' : 'Not sharing data'}
                </span>
              </div>
            )}
          </section>

          {/* Chrome extension */}
          <section style={{ ...sectionStyle, borderBottom: 'none', marginBottom: 0 }}>
            <p style={headingStyle}>Chrome extension</p>
            {/* Consequence-first microcopy, at the point the decision is made. */}
            <p style={helpStyle}>
              A token connects the jlog extension to this account. It is shown once, expires after
              24 hours, and anyone holding it can add applications as you.
            </p>

            {extToken.status === 'idle' && (
              <div>
                <Button size="sm" onClick={generateExtensionToken}>
                  Generate token
                </Button>
              </div>
            )}

            {extToken.status === 'loading' && <Spinner size={16} />}

            {extToken.status === 'shown' && (
              <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <code
                    style={{
                      flex: 1,
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                      padding: '8px 10px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--text-xs)',
                      color: 'var(--color-text-primary)',
                      wordBreak: 'break-all',
                      userSelect: 'all',
                    }}
                  >
                    {extToken.token}
                  </code>
                  <Button variant="outline" size="sm" onClick={() => copyToken(extToken.token)}>
                    Copy
                  </Button>
                </div>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                  Shown once. Hides automatically after 60 seconds.
                </p>
              </div>
            )}

            {extToken.status === 'hidden' && (
              <div style={{ display: 'grid', gap: 'var(--space-3)', justifyItems: 'start' }}>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                  Token generated — paste it into the extension popup.
                </p>
                <Button variant="outline" size="sm" onClick={generateExtensionToken}>
                  Generate new token
                </Button>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
