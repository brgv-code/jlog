import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { loginUrlFor } from '../lib/next';
import { Sidebar } from './Sidebar';
import { CvWorkspace } from './cv/CvWorkspace';
import { JlogMark } from './ui/JlogMark';

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

/**
 * The CV surface, on its own route.
 *
 * It used to be two cards two thirds of the way down Settings, which put the
 * thing every generated CV and cover letter is built from behind the analytics
 * opt-in and the theme picker. It is a primary feature, so it gets a primary
 * place.
 */
export default function CvShell() {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    apiFetch('/api/auth/me')
      .then(async (res) => {
        if (!res.ok) {
          setAuth({ status: 'unauthenticated' });
          return;
        }
        const body = (await res.json()) as { user: User };
        setAuth({ status: 'authenticated', user: body.user });
      })
      .catch(() => setAuth({ status: 'unauthenticated' }));
  }, []);

  useEffect(() => {
    if (auth.status === 'unauthenticated') window.location.href = loginUrlFor(window.location);
  }, [auth.status]);

  async function handleSignOut() {
    await apiFetch('/api/auth/sign-out', { method: 'POST' });
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
        }}
      >
        <JlogMark mode="think" size={44} label="Loading" />
      </div>
    );
  }
  if (auth.status === 'unauthenticated') return null;

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: 'var(--color-bg)',
        fontFamily: 'var(--font-sans)',
        color: 'var(--color-text-primary)',
      }}
    >
      <Sidebar user={auth.user} active="cv" onSignOut={handleSignOut} />

      {/* The workspace fills the height: editor and page side by side, each
          scrolling on its own, so the page stays in view while you edit. */}
      <div style={{ flex: 1, minWidth: 0, height: '100vh', display: 'flex' }}>
        <CvWorkspace />
      </div>
    </div>
  );
}
