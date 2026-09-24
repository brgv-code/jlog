import { type CSSProperties, useState } from 'react';
import { apiFetch } from '../../lib/api';

/**
 * Deleting your account, and everything in it.
 *
 * Two deliberate frictions, because this is the one action in jlog that cannot
 * be undone: it stays collapsed until asked for, and then requires the account's
 * own email address to be typed out. A button you can hit twice by accident is
 * the wrong shape for something that removes a year of job hunting.
 *
 * The list of what goes is spelled out rather than summarised as "all your
 * data", because "all" is exactly the word people skim.
 */
export function DeleteAccount({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmed = typed.trim().toLowerCase() === email.trim().toLowerCase();

  async function handleDelete() {
    if (!confirmed || deleting) return;

    setDeleting(true);
    setError(null);

    try {
      const res = await apiFetch('/api/auth/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        setError(body.message ?? 'Could not delete the account. Please try again.');
        setDeleting(false);
        return;
      }

      // The server has already cleared the session cookie. Straight to the
      // landing page rather than the dashboard, which would only bounce to a
      // login for an account that no longer exists.
      window.location.href = '/';
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setDeleting(false);
    }
  }

  return (
    <section style={sectionStyle}>
      <p style={headingStyle}>Delete account</p>
      <p style={helpStyle}>
        Permanently deletes your account and everything stored against it: your applications and
        their timelines, your imported CV and the facts taken from it, every generated CV and cover
        letter, your saved AI provider key, and your extension keys. If you are on the paid plan,
        the subscription is cancelled at the same time.
      </p>
      <p style={{ ...helpStyle, color: 'var(--color-text-primary)', fontWeight: 550 }}>
        This cannot be undone, and there is no copy kept.
      </p>

      {error && (
        <p role="alert" style={errorStyle}>
          {error}
        </p>
      )}

      {open ? (
        <div style={{ display: 'grid', gap: 'var(--space-3)', maxWidth: '32rem' }}>
          <label htmlFor="confirm-delete" style={labelStyle}>
            Type <strong style={{ color: 'var(--color-text-primary)' }}>{email}</strong> to confirm
          </label>
          <input
            id="confirm-delete"
            type="text"
            autoComplete="off"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={email}
            style={inputStyle}
          />
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <button
              type="button"
              onClick={handleDelete}
              disabled={!confirmed || deleting}
              style={{
                ...dangerButtonStyle,
                opacity: confirmed && !deleting ? 1 : 0.5,
                cursor: confirmed && !deleting ? 'pointer' : 'not-allowed',
              }}
            >
              {deleting ? 'Deleting…' : 'Delete my account permanently'}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setTyped('');
                setError(null);
              }}
              disabled={deleting}
              style={quietButtonStyle}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button type="button" onClick={() => setOpen(true)} style={dangerOutlineStyle}>
            Delete account…
          </button>
        </div>
      )}
    </section>
  );
}

// Matches the section rhythm of the rest of Settings, minus the bottom border:
// this is the last thing on the page.
const sectionStyle: CSSProperties = {
  display: 'grid',
  gap: 'var(--space-4)',
  paddingBottom: 'var(--space-10)',
};

const headingStyle: CSSProperties = {
  fontSize: 'var(--text-sm)',
  fontWeight: 600,
  color: 'var(--color-danger)',
  letterSpacing: '-0.01em',
};

const helpStyle: CSSProperties = {
  fontSize: 'var(--text-sm)',
  color: 'var(--color-text-secondary)',
  lineHeight: 1.6,
  maxWidth: '62ch',
};

const labelStyle: CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--color-text-secondary)',
};

const inputStyle: CSSProperties = {
  width: '100%',
  padding: 'var(--space-3)',
  fontSize: 'var(--text-sm)',
  color: 'var(--color-text-primary)',
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
};

const baseButtonStyle: CSSProperties = {
  fontSize: 'var(--text-sm)',
  fontWeight: 600,
  padding: 'var(--space-3) var(--space-5)',
  borderRadius: 'var(--radius-md)',
  cursor: 'pointer',
};

const dangerOutlineStyle: CSSProperties = {
  ...baseButtonStyle,
  background: 'transparent',
  color: 'var(--color-danger)',
  border: '1px solid var(--color-danger-border)',
};

const dangerButtonStyle: CSSProperties = {
  ...baseButtonStyle,
  background: 'var(--color-danger)',
  color: 'var(--color-danger-fg)',
  border: '1px solid transparent',
};

const quietButtonStyle: CSSProperties = {
  ...baseButtonStyle,
  background: 'var(--color-surface)',
  color: 'var(--color-text-primary)',
  border: '1px solid var(--color-border)',
};

const errorStyle: CSSProperties = {
  background: 'var(--color-danger-bg)',
  color: 'var(--color-danger)',
  border: '1px solid var(--color-danger-border)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-3)',
  fontSize: 'var(--text-sm)',
  maxWidth: '62ch',
};
