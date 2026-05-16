import { useEffect, useState } from 'react';

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

const API_URL = import.meta.env.PUBLIC_API_URL;

export default function DashboardShell() {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    fetch(`${API_URL}/api/auth/me`, { credentials: 'include' })
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
      .catch(() => {
        setAuth({ status: 'unauthenticated' });
      });
  }, []);

  // Redirect to login if not authenticated — effect runs after render
  useEffect(() => {
    if (auth.status === 'unauthenticated') {
      window.location.href = '/login';
    }
  }, [auth.status]);

  async function handleSignOut() {
    await fetch(`${API_URL}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
    window.location.href = '/login';
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
          color: 'var(--color-text-secondary)',
          fontFamily: 'var(--font-sans)',
        }}
      >
        Loading…
      </div>
    );
  }

  if (auth.status === 'unauthenticated') {
    // Redirect is in progress; render nothing to avoid flash
    return null;
  }

  const { user } = auth;

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
        <span
          style={{
            fontWeight: 700,
            fontSize: 'var(--text-lg)',
            letterSpacing: '-0.02em',
            color: 'var(--color-text-primary)',
          }}
        >
          jlog
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          {user.avatarUrl && (
            <img
              src={user.avatarUrl}
              alt={user.name}
              width={32}
              height={32}
              style={{ borderRadius: '50%', display: 'block' }}
            />
          )}
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
            {user.name}
          </span>
          <button
            type="button"
            onClick={handleSignOut}
            style={{
              background: 'none',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-text-secondary)',
              fontSize: 'var(--text-xs)',
              padding: 'var(--space-1) var(--space-3)',
              cursor: 'pointer',
              transition: 'color var(--transition-fast)',
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Main content placeholder — full dashboard in Phase 2 */}
      <main
        style={{
          padding: 'var(--space-12) var(--space-8)',
          maxWidth: '1200px',
          margin: '0 auto',
        }}
      >
        <h1
          style={{
            fontSize: 'var(--text-2xl)',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            marginBottom: 'var(--space-2)',
          }}
        >
          Welcome, {user.name}
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
          Your dashboard is being built. Full features arrive in Phase 2.
        </p>
      </main>
    </div>
  );
}
