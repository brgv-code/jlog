import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import { LLMConfigForm } from './settings/LLMConfigForm';
import { Spinner } from './ui/Spinner';

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

type Theme = 'dark' | 'light';

const THEME_KEY = 'jlog_theme';

function readTheme(): Theme {
  if (typeof localStorage === 'undefined') return 'dark';
  return (localStorage.getItem(THEME_KEY) as Theme | null) ?? 'dark';
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
}

type ExtensionTokenState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'shown'; token: string }
  | { status: 'hidden' };

export default function SettingsShell() {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' });
  const [theme, setTheme] = useState<Theme>('dark');
  const [extToken, setExtToken] = useState<ExtensionTokenState>({ status: 'idle' });
  const [analyticsOptIn, setAnalyticsOptIn] = useState(false);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const tokenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTheme(readTheme());
  }, []);

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

  function toggleTheme(next: Theme) {
    setTheme(next);
    applyTheme(next);
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

  const sectionHeadingStyle = {
    fontSize: 'var(--text-xs)',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    marginBottom: 'var(--space-4)',
  };

  const cardStyle = {
    backgroundColor: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-lg)',
    padding: 'var(--space-6)',
    marginBottom: 'var(--space-6)',
  };

  const toggleBtnStyle = (active: boolean) =>
    ({
      background: active ? 'var(--color-accent)' : 'var(--color-surface-raised)',
      border: active ? 'none' : '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      color: active ? '#fff' : 'var(--color-text-secondary)',
      fontSize: 'var(--text-sm)',
      padding: '6px 16px',
      cursor: 'pointer',
      fontFamily: 'var(--font-sans)',
    }) as const;

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--color-bg)',
        fontFamily: 'var(--font-sans)',
        color: 'var(--color-text-primary)',
      }}
    >
      {/* Top bar */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 var(--space-8)',
          height: '56px',
          borderBottom: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-surface)',
        }}
      >
        <a
          href="/dashboard"
          style={{
            fontWeight: 700,
            fontSize: 'var(--text-lg)',
            letterSpacing: '-0.02em',
            color: 'var(--color-text-primary)',
            textDecoration: 'none',
          }}
        >
          jlog
        </a>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <a
            href="/dashboard"
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-secondary)',
              textDecoration: 'none',
            }}
          >
            Dashboard
          </a>
        </div>
      </header>

      <main
        style={{
          padding: 'var(--space-8)',
          maxWidth: '640px',
          margin: '0 auto',
        }}
      >
        <h1
          style={{
            fontSize: 'var(--text-2xl)',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            marginBottom: 'var(--space-8)',
          }}
        >
          Settings
        </h1>

        {/* Profile section */}
        <section style={{ marginBottom: 'var(--space-8)' }}>
          <p style={sectionHeadingStyle}>Profile</p>
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name}
                  width={48}
                  height={48}
                  style={{ borderRadius: '50%', display: 'block' }}
                />
              ) : (
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--color-surface-raised)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 'var(--text-lg)',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  {user.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <div
                  style={{
                    fontSize: 'var(--text-base)',
                    fontWeight: 600,
                    color: 'var(--color-text-primary)',
                  }}
                >
                  {user.name}
                </div>
                <div
                  style={{
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-text-secondary)',
                    marginTop: '2px',
                  }}
                >
                  {user.email}
                </div>
                <div
                  style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-text-tertiary)',
                    marginTop: 'var(--space-1)',
                  }}
                >
                  Managed via GitHub
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Theme section */}
        <section style={{ marginBottom: 'var(--space-8)' }}>
          <p style={sectionHeadingStyle}>Appearance</p>
          <div style={cardStyle}>
            <p
              style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--color-text-secondary)',
                marginBottom: 'var(--space-4)',
              }}
            >
              Choose how jlog looks in your browser.
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button
                type="button"
                style={toggleBtnStyle(theme === 'dark')}
                onClick={() => toggleTheme('dark')}
              >
                Dark
              </button>
              <button
                type="button"
                style={toggleBtnStyle(theme === 'light')}
                onClick={() => toggleTheme('light')}
              >
                Light
              </button>
            </div>
          </div>
        </section>

        {/* LLM Provider section */}
        <section style={{ marginBottom: 'var(--space-8)' }}>
          <p style={sectionHeadingStyle}>LLM Provider</p>
          <div style={cardStyle}>
            <p
              style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--color-text-secondary)',
                marginBottom: 'var(--space-4)',
              }}
            >
              Choose the AI provider used to extract job details from postings. API keys are
              encrypted at rest using AES-GCM.
            </p>
            <LLMConfigForm />
          </div>
        </section>

        {/* Analytics opt-in section */}
        <section style={{ marginBottom: 'var(--space-8)' }}>
          <p style={sectionHeadingStyle}>Analytics</p>
          <div style={cardStyle}>
            <p
              style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--color-text-secondary)',
                marginBottom: 'var(--space-4)',
                lineHeight: 1.6,
              }}
            >
              Help improve jlog by sharing anonymized data — response rates, time-to-offer, ghosting
              patterns. No company names, no personal details. Your data helps other job seekers
              understand the market.
            </p>
            {analyticsLoading ? null : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <button
                  type="button"
                  onClick={() => toggleAnalyticsOptIn(!analyticsOptIn)}
                  style={{
                    width: '40px',
                    height: '22px',
                    borderRadius: 'var(--radius-full)',
                    border: 'none',
                    backgroundColor: analyticsOptIn ? 'var(--color-accent)' : 'var(--color-surface-raised)',
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
                      left: analyticsOptIn ? '21px' : '3px',
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      backgroundColor: '#fff',
                      transition: 'left var(--transition-fast)',
                    }}
                  />
                </button>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                  {analyticsOptIn ? 'Contributing anonymized data' : 'Not sharing data'}
                </span>
              </div>
            )}
          </div>
        </section>

        {/* Extension section */}
        <section>
          <p style={sectionHeadingStyle}>Chrome Extension</p>
          <div style={cardStyle}>
            <p
              style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--color-text-secondary)',
                marginBottom: 'var(--space-4)',
              }}
            >
              Generate a token to connect the jlog Chrome extension to your account. The token
              expires after 24 hours.
            </p>

            {extToken.status === 'idle' && (
              <button
                type="button"
                onClick={generateExtensionToken}
                style={{
                  background: 'var(--color-accent)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  color: '#fff',
                  fontSize: 'var(--text-sm)',
                  padding: '8px 16px',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                Generate token
              </button>
            )}

            {extToken.status === 'loading' && <Spinner size={16} />}

            {extToken.status === 'shown' && (
              <div>
                <p
                  style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-danger)',
                    marginBottom: 'var(--space-2)',
                    fontWeight: 600,
                  }}
                >
                  This token is shown once. Save it to your extension popup.
                </p>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    marginBottom: 'var(--space-3)',
                  }}
                >
                  <code
                    style={{
                      flex: 1,
                      background: 'var(--color-surface-raised)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                      padding: '8px 10px',
                      fontFamily: "'SF Mono', 'Fira Code', monospace",
                      fontSize: 'var(--text-xs)',
                      color: 'var(--color-text-primary)',
                      wordBreak: 'break-all',
                      userSelect: 'all',
                    }}
                  >
                    {extToken.token}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyToken(extToken.token)}
                    style={{
                      background: 'var(--color-surface-raised)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--color-text-secondary)',
                      fontSize: 'var(--text-xs)',
                      padding: '8px 12px',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-sans)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Copy
                  </button>
                </div>
                <p
                  style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-text-tertiary)',
                  }}
                >
                  Token hides automatically after 60 seconds.
                </p>
              </div>
            )}

            {extToken.status === 'hidden' && (
              <div>
                <p
                  style={{
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-text-secondary)',
                    marginBottom: 'var(--space-3)',
                  }}
                >
                  Token generated — paste it into the extension popup.
                </p>
                <button
                  type="button"
                  onClick={generateExtensionToken}
                  style={{
                    background: 'var(--color-surface-raised)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--color-text-secondary)',
                    fontSize: 'var(--text-sm)',
                    padding: '6px 14px',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  Generate new token
                </button>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
