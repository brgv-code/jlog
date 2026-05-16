import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';

interface Stats {
  total: number;
  thisWeek: number;
  interviewRate: number;
  offers: number;
}

function SkeletonBox() {
  return (
    <div
      style={{
        width: '48px',
        height: '28px',
        borderRadius: 'var(--radius-sm)',
        backgroundColor: 'var(--color-surface-raised)',
        marginBottom: 'var(--space-1)',
      }}
    />
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  loading: boolean;
}

function StatCard({ label, value, loading }: StatCardProps) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-1)',
        padding: 'var(--space-4) var(--space-6)',
      }}
    >
      {loading ? (
        <SkeletonBox />
      ) : (
        <span
          style={{
            fontSize: 'var(--text-2xl)',
            fontWeight: 600,
            letterSpacing: '-0.02em',
            color: 'var(--color-text-primary)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {value}
        </span>
      )}
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
        {label}
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

  const dividerStyle = {
    width: '1px',
    backgroundColor: 'var(--color-border)',
    alignSelf: 'stretch',
    margin: 'var(--space-3) 0',
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        borderBottom: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-surface)',
      }}
    >
      <StatCard label="Total" value={stats?.total ?? 0} loading={loading} />
      <div style={dividerStyle} />
      <StatCard label="This week" value={stats?.thisWeek ?? 0} loading={loading} />
      <div style={dividerStyle} />
      <StatCard
        label="Interview rate"
        value={stats ? `${stats.interviewRate}%` : '0%'}
        loading={loading}
      />
      <div style={dividerStyle} />
      <StatCard label="Offers" value={stats?.offers ?? 0} loading={loading} />
    </div>
  );
}
