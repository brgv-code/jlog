import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../lib/api';

interface Stats {
  total: number;
  thisWeek: number;
  interviewRate: number;
  offers: number;
  avgDaysToResponse: number | null;
  ghosted: number;
  responseRate: number;
}

const LABEL_STYLE = {
  fontSize: '10px',
  fontWeight: 500,
  letterSpacing: '0.07em',
  textTransform: 'uppercase' as const,
  color: 'var(--color-text-tertiary)',
  whiteSpace: 'nowrap' as const,
};

function StatCell({
  label,
  value,
  loading,
  warn,
}: { label: string; value: string | number; loading: boolean; warn?: boolean }) {
  /*
   * Flash when the number changes under the reader — after tracking a job, or
   * after a status edit recalculates a rate. Not on first load: arriving at a
   * populated strip is not a change, and flashing all eight at once would be
   * decoration. `loading` is what separates the two, since the strip renders
   * its shell before it has anything to say.
   */
  const previous = useRef<string | number | null>(null);
  const [changeNonce, setChangeNonce] = useState(0);

  useEffect(() => {
    if (loading) return;
    if (previous.current !== null && previous.current !== value) {
      setChangeNonce((n) => n + 1);
    }
    previous.current = value;
  }, [value, loading]);

  return (
    <div
      style={{
        flex: 1,
        minWidth: '108px',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        padding: 'var(--space-5) var(--space-6)',
      }}
    >
      {/*
        Label first, and always rendered. "Render the shell before the data"
        (rule 6): the strip should teach what jlog is going to tell you before
        it has anything to tell.
      */}
      <span style={LABEL_STYLE}>{label}</span>
      <span
        key={changeNonce}
        className={changeNonce > 0 ? 'jlog-attention' : undefined}
        style={{
          fontSize: 'var(--text-2xl)',
          fontWeight: 500,
          letterSpacing: '-0.02em',
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
          // Inline-block so the wash has a box to sit in; the gesture marks the
          // change without moving anything, because the strip is being read.
          display: 'inline-block',
          borderRadius: 'var(--radius-sm)',
          color: loading
            ? 'var(--color-text-tertiary)'
            : warn
              ? 'var(--color-warning)'
              : 'var(--color-text-primary)',
        }}
      >
        {loading ? '—' : value}
      </span>
    </div>
  );
}

export function StatsStrip() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/stats')
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as Stats;
        setStats(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const divider = (
    <div
      style={{
        width: '1px',
        backgroundColor: 'var(--color-border)',
        alignSelf: 'stretch',
        margin: 'var(--space-5) 0',
      }}
    />
  );

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        borderTop: '1px solid var(--color-border)',
        borderBottom: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-bg)',
        overflowX: 'auto',
      }}
    >
      <StatCell label="Total" value={stats?.total ?? 0} loading={loading} />
      {divider}
      <StatCell label="This week" value={stats?.thisWeek ?? 0} loading={loading} />
      {divider}
      <StatCell
        label="Response rate"
        value={stats ? `${stats.responseRate}%` : '0%'}
        loading={loading}
      />
      {divider}
      <StatCell
        label="Interview rate"
        value={stats ? `${stats.interviewRate}%` : '0%'}
        loading={loading}
      />
      {divider}
      <StatCell label="Offers" value={stats?.offers ?? 0} loading={loading} />
      {divider}
      <StatCell
        label="Avg response"
        value={stats?.avgDaysToResponse != null ? `${stats.avgDaysToResponse}d` : '—'}
        loading={loading}
      />
      {divider}
      <StatCell
        label="Ghosted"
        value={stats?.ghosted ?? 0}
        loading={loading}
        warn={(stats?.ghosted ?? 0) > 0}
      />
    </div>
  );
}
