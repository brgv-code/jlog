import type { ApplicationStatus } from '@jlog/shared';
import { useEffect, useRef, useState } from 'react';
import { EmptyState } from '../ui/EmptyState';
import { StatusSelect } from './StatusSelect';

interface Application {
  id: string;
  company: string;
  role: string;
  location: string | null;
  status: ApplicationStatus;
  sourceUrl: string | null;
  sourceSite: string | null;
  appliedAt: string | null;
  createdAt: string;
}

interface ApplicationsTableProps {
  applications: Application[];
  onRowClick: (id: string) => void;
  selectedId?: string | undefined;
  onStatusChange: (id: string, newStatus: ApplicationStatus) => void;
  onAddClick: () => void;
}

const SOURCE_LABELS: Record<string, string> = {
  linkedin: 'LinkedIn',
  ashby: 'Ashby',
  ashbyhq: 'Ashby',
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  wellfound: 'Wellfound',
  ycombinator: 'Y Combinator',
  personio: 'Personio',
  workday: 'Workday',
  smartrecruiters: 'SmartRecruiters',
  jobvite: 'Jobvite',
  icims: 'iCIMS',
  bamboohr: 'BambooHR',
  generic: 'AI extracted',
  manual: 'Manual',
};

function formatSourceSite(site: string | null): string {
  if (!site) return 'Manual';
  return SOURCE_LABELS[site.toLowerCase()] ?? site.charAt(0).toUpperCase() + site.slice(1);
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const TH_STYLE = {
  textAlign: 'left' as const,
  fontSize: '11px',
  fontWeight: 500,
  color: 'var(--color-text-secondary)',
  padding: '0 var(--space-4)',
  height: '36px',
  borderBottom: '1px solid var(--color-border)',
  whiteSpace: 'nowrap' as const,
  userSelect: 'none' as const,
};

const TD_STYLE = {
  padding: '0 var(--space-4)',
  height: '44px',
  fontSize: 'var(--text-sm)',
  color: 'var(--color-text-primary)',
  borderBottom: '1px solid var(--color-border)',
  whiteSpace: 'nowrap' as const,
};

export function ApplicationsTable({
  applications,
  onRowClick,
  selectedId,
  onStatusChange,
  onAddClick,
}: ApplicationsTableProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);

  // Keep focused index in sync with selectedId
  useEffect(() => {
    if (selectedId) {
      const idx = applications.findIndex((a) => a.id === selectedId);
      if (idx !== -1) setFocusedIndex(idx);
    }
  }, [selectedId, applications]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (applications.length === 0) return;
    if (e.key === 'j' || e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((i) => Math.min(i + 1, applications.length - 1));
    } else if (e.key === 'k' || e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      const app = applications[focusedIndex];
      if (app) onRowClick(app.id);
    }
  }

  if (applications.length === 0) {
    return (
      <EmptyState
        title="No applications yet"
        description="Track your job applications by adding one above."
        action={
          <button
            type="button"
            onClick={onAddClick}
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
        }
      />
    );
  }

  return (
    <div
      ref={tableRef}
      role="treegrid"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{ outline: 'none', overflow: 'auto' }}
      aria-label="Applications table"
    >
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '22%' }} />
          <col style={{ width: '22%' }} />
          <col style={{ width: '16%' }} />
          <col style={{ width: '14%' }} />
          <col style={{ width: '14%' }} />
          <col style={{ width: '12%' }} />
        </colgroup>
        <thead>
          <tr>
            <th style={TH_STYLE}>Company</th>
            <th style={TH_STYLE}>Role</th>
            <th style={TH_STYLE}>Location</th>
            <th style={TH_STYLE}>Status</th>
            <th style={{ ...TH_STYLE, fontVariantNumeric: 'tabular-nums' }}>Applied</th>
            <th style={TH_STYLE}>Source</th>
          </tr>
        </thead>
        <tbody>
          {applications.map((app, idx) => {
            const isSelected = app.id === selectedId;
            const isHovered = app.id === hoveredId;
            const isFocused = idx === focusedIndex;
            const bg = isSelected
              ? 'var(--color-surface-raised)'
              : isHovered
                ? 'rgba(255,255,255,0.03)'
                : 'transparent';
            return (
              <tr
                key={app.id}
                onClick={() => onRowClick(app.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onRowClick(app.id);
                }}
                onMouseEnter={() => setHoveredId(app.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  backgroundColor: bg,
                  cursor: 'pointer',
                  borderLeft: isSelected
                    ? '2px solid var(--color-accent)'
                    : '2px solid transparent',
                  outline: isFocused && !isSelected ? '1px solid var(--color-accent)' : undefined,
                }}
              >
                <td
                  style={{
                    ...TD_STYLE,
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {app.company}
                </td>
                <td
                  style={{
                    ...TD_STYLE,
                    color: 'var(--color-text-secondary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {app.role}
                </td>
                <td
                  style={{
                    ...TD_STYLE,
                    color: 'var(--color-text-secondary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {app.location ?? '—'}
                </td>
                <td style={TD_STYLE}>
                  <StatusSelect
                    applicationId={app.id}
                    currentStatus={app.status}
                    onStatusChange={(s) => onStatusChange(app.id, s)}
                  />
                </td>
                <td
                  style={{
                    ...TD_STYLE,
                    color: 'var(--color-text-secondary)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {formatDate(app.appliedAt)}
                </td>
                <td style={{ ...TD_STYLE, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {app.sourceUrl ? (
                    <a
                      href={app.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={{ color: 'var(--color-accent)', fontSize: 'var(--text-xs)' }}
                    >
                      {formatSourceSite(app.sourceSite)}
                    </a>
                  ) : (
                    <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)' }}>
                      {formatSourceSite(app.sourceSite)}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
