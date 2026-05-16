import type { ApplicationStatus } from '@jlog/shared';
import { APPLICATION_STATUSES } from '@jlog/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import { AddApplicationDialog } from './applications/AddApplicationDialog';
import { ApplicationDetail } from './applications/ApplicationDetail';
import { ApplicationsTable } from './applications/ApplicationsTable';
import { StatsStrip } from './applications/StatsStrip';
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

interface Application {
  id: string;
  company: string;
  role: string;
  location: string | null;
  status: ApplicationStatus;
  sourceUrl: string | null;
  sourceSite: string | null;
  appliedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

type SortField = 'createdAt' | 'appliedAt' | 'company';

const STATUS_TABS: { label: string; value: ApplicationStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  ...APPLICATION_STATUSES.map((s: ApplicationStatus) => ({
    label: s.charAt(0).toUpperCase() + s.slice(1),
    value: s,
  })),
];

export default function DashboardShell() {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' });
  const [applications, setApplications] = useState<Application[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sort, setSort] = useState<SortField>('createdAt');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Auth check
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

  // Debounce search
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchQuery]);

  // Fetch applications
  const fetchApplications = useCallback(() => {
    setLoadingApps(true);
    const params = new URLSearchParams({ sort });
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (debouncedQuery) params.set('q', debouncedQuery);

    apiFetch(`/api/applications?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { applications: Application[] };
        setApplications(data.applications);
      })
      .catch(() => {})
      .finally(() => setLoadingApps(false));
  }, [statusFilter, debouncedQuery, sort]);

  useEffect(() => {
    if (auth.status === 'authenticated') fetchApplications();
  }, [auth.status, fetchApplications]);

  async function handleSignOut() {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  function handleAddSuccess(app: Application) {
    setApplications((prev) => [app, ...prev]);
    setShowAddDialog(false);
  }

  function handleStatusChange(id: string, newStatus: ApplicationStatus) {
    setApplications((prev) => prev.map((a) => (a.id === id ? { ...a, status: newStatus } : a)));
  }

  function handleDetailUpdate(updated: Application) {
    setApplications((prev) => prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)));
  }

  function handleDelete(id: string) {
    setApplications((prev) => prev.filter((a) => a.id !== id));
    setSelectedId(null);
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
          <button
            type="button"
            onClick={() => setShowAddDialog(true)}
            style={{
              backgroundColor: 'var(--color-accent)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              color: '#fff',
              fontSize: 'var(--text-sm)',
              padding: '6px 16px',
              cursor: 'pointer',
            }}
          >
            Add application
          </button>
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
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <StatsStrip />

      {/* Detail view replaces main when selected */}
      {selectedId ? (
        <ApplicationDetail
          applicationId={selectedId}
          onBack={() => setSelectedId(null)}
          onDelete={handleDelete}
          onUpdate={handleDetailUpdate}
        />
      ) : (
        <main
          style={{
            padding: '0 var(--space-8) var(--space-8)',
            maxWidth: '1400px',
            margin: '0 auto',
          }}
        >
          {/* Filter bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-4)',
              padding: 'var(--space-4) 0',
              borderBottom: '1px solid var(--color-border)',
              flexWrap: 'wrap',
            }}
          >
            {/* Status tabs */}
            <div style={{ display: 'flex', gap: '2px' }}>
              {STATUS_TABS.map((tab) => {
                const active = tab.value === statusFilter;
                return (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => setStatusFilter(tab.value)}
                    style={{
                      background: active ? 'var(--color-surface-raised)' : 'none',
                      border: active ? '1px solid var(--color-border)' : '1px solid transparent',
                      borderRadius: 'var(--radius-md)',
                      color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                      fontSize: 'var(--text-xs)',
                      padding: '4px 10px',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Search */}
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search company or role…"
              style={{
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-text-primary)',
                fontSize: 'var(--text-sm)',
                padding: '4px 10px',
                outline: 'none',
                width: '220px',
              }}
            />

            {/* Sort */}
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortField)}
              style={{
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-text-secondary)',
                fontSize: 'var(--text-xs)',
                padding: '4px 8px',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="createdAt">Sort: Date added</option>
              <option value="appliedAt">Sort: Applied date</option>
              <option value="company">Sort: Company</option>
            </select>

            {loadingApps && <Spinner size={16} />}
          </div>

          <ApplicationsTable
            applications={applications}
            onRowClick={(id) => setSelectedId(id)}
            selectedId={selectedId ?? undefined}
            onStatusChange={handleStatusChange}
            onAddClick={() => setShowAddDialog(true)}
          />
        </main>
      )}

      {showAddDialog && (
        <AddApplicationDialog
          onSuccess={handleAddSuccess}
          onClose={() => setShowAddDialog(false)}
        />
      )}
    </div>
  );
}
