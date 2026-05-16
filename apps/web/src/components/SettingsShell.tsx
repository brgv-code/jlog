import { useEffect, useState } from 'react';
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

export default function SettingsShell() {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' });
  const [theme, setTheme] = useState<Theme>('dark');

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

  function toggleTheme(next: Theme) {
    setTheme(next);
    applyTheme(next);
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
        <section>
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
      </main>
    </div>
  );
}
