import type { ApplicationStatus } from '@jlog/shared';
import { APPLICATION_STATUSES } from '@jlog/shared';
import { BriefcaseIcon, PlusIcon, SearchIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import { Sidebar } from './Sidebar';
import { AddApplicationDialog } from './applications/AddApplicationDialog';
import { ApplicationDetail } from './applications/ApplicationDetail';
import { ApplicationsTable } from './applications/ApplicationsTable';
import { Spinner } from './ui/Spinner';
import { Button } from './ui/button';

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

export default function ApplicationsShell() {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' });
  const [applications, setApplications] = useState<Application[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | 'all'>('all');
  // Home links here with a filter already chosen, so the tile you clicked and
  // the list you land on agree.
  const [view, setView] = useState<'all' | 'ghosted'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sort, setSort] = useState<SortField>('createdAt');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');
    if (status && (APPLICATION_STATUSES as readonly string[]).includes(status)) {
      setStatusFilter(status as ApplicationStatus);
    }
    if (params.get('view') === 'ghosted') {
      setStatusFilter('applied');
      setView('ghosted');
    }
  }, []);

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

  const GHOSTED_AFTER_DAYS = 14;

  // Fetch a page. A cursor means "append"; no cursor means "replace", which is
  // what every filter change does.
  const fetchPage = useCallback(
    (cursor: string | null) => {
      if (cursor) setLoadingMore(true);
      else setLoadingApps(true);

      const params = new URLSearchParams({ sort });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (debouncedQuery) params.set('q', debouncedQuery);
      if (view === 'ghosted') {
        params.set(
          'appliedBefore',
          new Date(Date.now() - GHOSTED_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString(),
        );
      }
      if (cursor) params.set('cursor', cursor);

      apiFetch(`/api/applications?${params.toString()}`)
        .then(async (res) => {
          if (!res.ok) return;
          const data = (await res.json()) as {
            applications: Application[];
            nextCursor: string | null;
            total: number;
          };
          setApplications((prev) => (cursor ? [...prev, ...data.applications] : data.applications));
          setNextCursor(data.nextCursor);
          setTotal(data.total);
        })
        .catch(() => {})
        .finally(() => {
          setLoadingApps(false);
          setLoadingMore(false);
        });
    },
    [statusFilter, debouncedQuery, sort, view],
  );

  // fetchPage changes identity whenever a filter does, so this doubles as the
  // reset: a new filter always starts from the first page.
  useEffect(() => {
    if (auth.status === 'authenticated') fetchPage(null);
  }, [auth.status, fetchPage]);

  async function handleSignOut() {
    await apiFetch('/api/auth/sign-out', { method: 'POST' });
    window.location.href = '/login';
  }

  function handleAddSuccess(app: Application) {
    setApplications((prev) => [app, ...prev]);
    setTotal((n) => n + 1);
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
    setTotal((n) => Math.max(0, n - 1));
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
        display: 'flex',
        minHeight: '100vh',
        backgroundColor: 'var(--color-bg)',
        fontFamily: 'var(--font-sans)',
        color: 'var(--color-text-primary)',
      }}
    >
      <Sidebar user={user} active="applications" onSignOut={handleSignOut} />

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/*
          A breadcrumb, not a page header. The rail already says where you are,
          so repeating it as a 28px title would spend the top of every screen
          restating something. The only thing that earns weight up here is the
          one primary action.
        */}
        <header
          style={{
            height: '56px',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-4)',
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
            <BriefcaseIcon
              size={14}
              strokeWidth={1.75}
              style={{ color: 'var(--color-icon-applications)' }}
            />
            Applications
          </span>
          {!selectedId && (
            <Button size="sm" onClick={() => setShowAddDialog(true)}>
              <PlusIcon size={14} strokeWidth={2} />
              Add application
            </Button>
          )}
        </header>

        {selectedId ? (
          <main
            style={{ flex: 1, minHeight: 0, maxWidth: '1400px', margin: '0 auto', width: '100%' }}
          >
            <ApplicationDetail
              applicationId={selectedId}
              userName={user.name}
              onBack={() => setSelectedId(null)}
              onDelete={handleDelete}
              onUpdate={handleDetailUpdate}
            />
          </main>
        ) : (
          <main
            style={{
              flex: 1,
              padding: '0 var(--space-8) var(--space-8)',
              maxWidth: '1400px',
              margin: '0 auto',
              width: '100%',
            }}
          >
            {/* Filter bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-4)',
                padding: 'var(--space-5) 0',
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
                      onClick={() => {
                        setStatusFilter(tab.value);
                        setView('all');
                      }}
                      style={{
                        background: active ? 'var(--color-surface-active)' : 'none',
                        border: 'none',
                        borderRadius: 'var(--radius-md)',
                        color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                        fontWeight: active ? 500 : 400,
                        fontSize: 'var(--text-xs)',
                        fontFamily: 'var(--font-sans)',
                        padding: '5px 10px',
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
              <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                <SearchIcon
                  size={14}
                  strokeWidth={1.75}
                  style={{
                    position: 'absolute',
                    left: '9px',
                    color: 'var(--color-text-tertiary)',
                    pointerEvents: 'none',
                  }}
                />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search company or role…"
                  style={{
                    backgroundColor: 'var(--color-bg)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--color-text-primary)',
                    fontFamily: 'var(--font-sans)',
                    fontSize: 'var(--text-sm)',
                    padding: '6px 10px 6px 28px',
                    outline: 'none',
                    width: '240px',
                  }}
                />
              </div>

              {/* Sort */}
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortField)}
                style={{
                  backgroundColor: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-text-secondary)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 'var(--text-xs)',
                  padding: '6px 8px',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <option value="createdAt">Sort: Date added</option>
                <option value="appliedAt">Sort: Applied date</option>
                <option value="company">Sort: Company</option>
              </select>

              {loadingApps && <Spinner size={16} />}

              <span
                style={{
                  marginLeft: 'auto',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-text-tertiary)',
                  fontVariantNumeric: 'tabular-nums',
                  whiteSpace: 'nowrap',
                }}
              >
                {loadingApps
                  ? ' '
                  : `${total.toLocaleString()} ${total === 1 ? 'application' : 'applications'}`}
              </span>
            </div>

            <ApplicationsTable
              applications={applications}
              onRowClick={(id) => setSelectedId(id)}
              selectedId={selectedId ?? undefined}
              onStatusChange={handleStatusChange}
              onAddClick={() => setShowAddDialog(true)}
              isFiltered={statusFilter !== 'all' || debouncedQuery !== '' || view === 'ghosted'}
              onClearFilters={() => {
                setStatusFilter('all');
                setSearchQuery('');
                setView('all');
              }}
            />

            {nextCursor && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  padding: 'var(--space-6) 0',
                }}
              >
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchPage(nextCursor)}
                  disabled={loadingMore}
                >
                  {loadingMore
                    ? 'Loading…'
                    : `Load more (${(total - applications.length).toLocaleString()} left)`}
                </Button>
              </div>
            )}
          </main>
        )}
      </div>

      {showAddDialog && (
        <AddApplicationDialog
          onSuccess={handleAddSuccess}
          onClose={() => setShowAddDialog(false)}
        />
      )}
    </div>
  );
}
