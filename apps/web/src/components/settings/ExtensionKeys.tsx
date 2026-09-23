import { EXTENSION_TOKEN_LIFETIMES, type ExtensionTokenLifetime } from '@jlog/shared';
import { AlertTriangleIcon, CheckIcon, CopyIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { Spinner } from '../ui/Spinner';
import { Button } from '../ui/button';

/**
 * Extension keys, modelled on GitHub's personal access tokens: pick a lifetime
 * up front, see the key exactly once, and keep a list you can revoke from.
 *
 * The lifetime picker exists because the old fixed 24-hour key meant re-pasting
 * into the popup every morning. "No expiration" is offered but never the
 * default, and it is the only option that carries a warning — a key that never
 * dies is only safe because the list below can kill it.
 */

const sectionStyle = {
  display: 'grid',
  gap: 'var(--space-4)',
  paddingBottom: 'var(--space-10)',
  marginBottom: 0,
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

const fieldLabelStyle = {
  fontSize: 'var(--text-xs)',
  color: 'var(--color-text-secondary)',
} as const;

const inputStyle = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--color-text-primary)',
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--text-sm)',
  padding: '7px 10px',
  outline: 'none',
} as const;

const LIFETIME_LABELS: Record<ExtensionTokenLifetime, string> = {
  '1d': '1 day',
  '7d': '7 days',
  '30d': '30 days',
  never: 'No expiration',
};

interface KeyRow {
  prefix: string;
  label: string | null;
  createdAt: string | null;
  /** Null means this key never expires. */
  expiresAt: string | null;
}

interface MintedKey extends KeyRow {
  token: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** "expires in 6 days" reads better than a date when the date is close. */
function describeExpiry(expiresAt: string | null): string {
  if (expiresAt === null) return 'Never expires';
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (Number.isNaN(ms)) return `Expires ${expiresAt}`;
  if (ms <= 0) return 'Expired';
  const days = Math.round(ms / (24 * 60 * 60 * 1000));
  if (days <= 1) return 'Expires within a day';
  if (days <= 14) return `Expires in ${days} days`;
  return `Expires ${formatDate(expiresAt)}`;
}

export function ExtensionKeys() {
  const [lifetime, setLifetime] = useState<ExtensionTokenLifetime>('30d');
  const [label, setLabel] = useState('');
  const [minting, setMinting] = useState(false);
  const [minted, setMinted] = useState<MintedKey | null>(null);
  const [copied, setCopied] = useState(false);
  const [keys, setKeys] = useState<KeyRow[] | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadKeys = useCallback(async () => {
    try {
      const res = await apiFetch('/api/extension/tokens');
      if (!res.ok) return;
      const data = (await res.json()) as { tokens: KeyRow[] };
      setKeys(data.tokens);
    } catch {
      setKeys([]);
    }
  }, []);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  useEffect(
    () => () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    },
    [],
  );

  async function generate() {
    setMinting(true);
    setError(null);
    try {
      const res = await apiFetch('/api/extension/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresIn: lifetime, label: label.trim() || undefined }),
      });
      if (!res.ok) {
        setError('Could not create a key. Try again.');
        return;
      }
      const data = (await res.json()) as MintedKey;
      setMinted(data);
      setLabel('');
      await loadKeys();
    } catch {
      setError('Could not reach jlog. Check your connection and try again.');
    } finally {
      setMinting(false);
    }
  }

  function copy(token: string) {
    void navigator.clipboard.writeText(token);
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
  }

  async function revoke(prefix: string) {
    setRevoking(prefix);
    try {
      await apiFetch(`/api/extension/tokens/${prefix}`, { method: 'DELETE' });
      // A revoked key must not linger in the one-time reveal box either.
      setMinted((m) => (m?.prefix === prefix ? null : m));
      await loadKeys();
    } catch {
      setError('Could not revoke that key. Try again.');
    } finally {
      setRevoking(null);
    }
  }

  return (
    <section style={sectionStyle}>
      <p style={headingStyle}>Chrome extension</p>
      {/* Consequence-first microcopy, at the point the decision is made. */}
      <p style={helpStyle}>
        A key connects the jlog extension to this account. It is shown once, and anyone holding it
        can add applications as you. Revoke it below if it ever leaves your machine.
      </p>

      {/* ---- Mint a new key ---- */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--space-3)',
          alignItems: 'flex-end',
        }}
      >
        <div style={{ display: 'grid', gap: 'var(--space-1)', minWidth: '170px' }}>
          <label htmlFor="ext-key-label" style={fieldLabelStyle}>
            Name (optional)
          </label>
          <input
            id="ext-key-label"
            style={inputStyle}
            value={label}
            maxLength={60}
            placeholder="Work laptop"
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>

        <div style={{ display: 'grid', gap: 'var(--space-1)' }}>
          <label htmlFor="ext-key-expiry" style={fieldLabelStyle}>
            Expiration
          </label>
          <select
            id="ext-key-expiry"
            style={{ ...inputStyle, cursor: 'pointer' }}
            value={lifetime}
            onChange={(e) => setLifetime(e.target.value as ExtensionTokenLifetime)}
          >
            {EXTENSION_TOKEN_LIFETIMES.map((v) => (
              <option key={v} value={v}>
                {LIFETIME_LABELS[v]}
              </option>
            ))}
          </select>
        </div>

        <Button size="sm" onClick={generate} disabled={minting}>
          {minting ? 'Generating…' : 'Generate key'}
        </Button>
      </div>

      {lifetime === 'never' && (
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-2)',
            alignItems: 'flex-start',
            padding: 'var(--space-3)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid hsl(var(--destructive) / 0.25)',
            background: 'hsl(var(--destructive) / 0.08)',
            maxWidth: '62ch',
          }}
        >
          <AlertTriangleIcon
            size={15}
            style={{ color: 'hsl(var(--destructive))', flexShrink: 0, marginTop: '2px' }}
          />
          <p style={{ ...noteStyle, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
            A key with no expiration stays valid until you revoke it here. If it is ever copied off
            your machine, it keeps working. Prefer a dated key unless the daily re-pasting is
            genuinely in your way.
          </p>
        </div>
      )}

      {error && <p style={{ ...noteStyle, color: 'hsl(var(--destructive))' }}>{error}</p>}

      {/* ---- The one-time reveal ---- */}
      {minted && (
        <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
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
              {minted.token}
            </code>
            <Button variant="outline" size="sm" onClick={() => copy(minted.token)}>
              {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <p style={noteStyle}>
            Paste this into the extension popup now — jlog will not show it again.{' '}
            {describeExpiry(minted.expiresAt)}.
          </p>
        </div>
      )}

      {/* ---- Active keys ---- */}
      <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
        <p style={{ ...fieldLabelStyle, fontWeight: 600 }}>Active keys</p>
        {keys === null && <Spinner size={16} />}
        {keys?.length === 0 && (
          <p style={noteStyle}>No keys yet. Generate one to connect the extension.</p>
        )}
        {keys?.map((k) => (
          <div
            key={k.prefix}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--space-3)',
              padding: 'var(--space-3)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <div style={{ display: 'grid', gap: '2px', minWidth: 0 }}>
              <span style={{ fontSize: 'var(--text-sm)' }}>
                {k.label ?? 'Extension key'}{' '}
                <code
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-text-tertiary)',
                  }}
                >
                  {k.prefix}…
                </code>
              </span>
              <span style={noteStyle}>
                {k.createdAt ? `Created ${formatDate(k.createdAt)} · ` : ''}
                {describeExpiry(k.expiresAt)}
              </span>
            </div>
            <Button
              variant="destructive"
              size="sm"
              disabled={revoking === k.prefix}
              onClick={() => revoke(k.prefix)}
            >
              {revoking === k.prefix ? 'Revoking…' : 'Revoke'}
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
