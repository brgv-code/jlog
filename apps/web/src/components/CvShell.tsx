import { FileUserIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { Sidebar } from './Sidebar';
import { CvProfileForm } from './settings/CvProfileForm';
import { ImportCvForm } from './settings/ImportCvForm';
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
    if (auth.status === 'unauthenticated') window.location.href = '/login';
  }, [auth.status]);

  async function handleSignOut() {
    await apiFetch('/api/auth/logout', { method: 'POST' });
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
        <Spinner />
      </div>
    );
  }
  if (auth.status === 'unauthenticated') return null;

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
      <Sidebar user={auth.user} active="cv" onSignOut={handleSignOut} />

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
            <FileUserIcon size={14} strokeWidth={1.75} style={{ color: 'var(--color-icon-cv)' }} />
            CV
          </span>
        </header>

        <main
          style={{
            flex: 1,
            padding: 'var(--space-6) var(--space-8) var(--space-16)',
            maxWidth: '820px',
            width: '100%',
            margin: '0 auto',
            display: 'grid',
            gap: 'var(--space-6)',
            alignContent: 'start',
          }}
        >
          <p
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-secondary)',
              lineHeight: 1.6,
              maxWidth: '62ch',
            }}
          >
            Import a CV once and jlog keeps two things from it: the header details below, and the
            stored facts every tailored CV and cover letter is built from. Nothing here is sent
            anywhere until you tailor against a specific application.
          </p>

          <ImportCvForm />
          <CvProfileForm />
        </main>
      </div>
    </div>
  );
}
