import type { ApplicationStatus } from '@jlog/shared';
import { BriefcaseIcon, SearchXIcon } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useCompanyLogo } from '../../lib/companyLogo';
import { EmptyState } from '../ui/EmptyState';
import { Button } from '../ui/button';
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
  /** A filter or search is narrowing the list, so "none" means "none matched". */
  isFiltered?: boolean;
  onClearFilters?: () => void;
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

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * A stable hue per company. Not random and not stored — the same employer gets
 * the same colour on every machine, which is what makes it useful as a landmark
 * when you are scanning for one row in fifty.
 */
function hueFor(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 360;
  return hash;
}

/**
 * The employer's logo where we have one, a coloured monogram where we do not.
 *
 * The monogram is the default rather than the failure state: most companies
 * will never resolve a logo, and a column of forty rows still needs landmarks.
 */
function CompanyAvatar({ company }: { company: string }) {
  const logo = useCompanyLogo(company);

  if (logo) {
    return (
      <img
        src={logo}
        alt=""
        width={32}
        height={32}
        style={{
          width: '32px',
          height: '32px',
          borderRadius: 'var(--radius-md)',
          objectFit: 'contain',
          // Logos arrive on whatever ground the board used. A neutral tile keeps
          // a white-on-transparent mark from vanishing in light mode.
          backgroundColor: 'var(--color-surface-raised)',
          flexShrink: 0,
        }}
      />
    );
  }

  return <Monogram company={company} />;
}

function Monogram({ company }: { company: string }) {
  return (
    <span
      aria-hidden="true"
      className="jlog-monogram"
      style={
        {
          '--mono-h': hueFor(company),
          width: '32px',
          height: '32px',
          borderRadius: 'var(--radius-md)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 'var(--text-xs)',
          fontWeight: 600,
          flexShrink: 0,
        } as CSSProperties
      }
    >
      {company.charAt(0).toUpperCase()}
    </span>
  );
}

export function ApplicationsTable({
  applications,
  onRowClick,
  selectedId,
  onStatusChange,
  onAddClick,
  isFiltered = false,
  onClearFilters,
}: ApplicationsTableProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // Each row's primary action is a real button, so j/k moves DOM focus rather
  // than tracking a parallel "focused index" that the browser knows nothing
  // about. That also keeps the nested status control and posting link valid —
  // a row that was itself a button could not contain either.
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!selectedId) return;
    const idx = applications.findIndex((a) => a.id === selectedId);
    if (idx !== -1) buttonsRef.current[idx]?.focus();
  }, [selectedId, applications]);

  function move(delta: number, e: React.KeyboardEvent) {
    const buttons = buttonsRef.current.filter(Boolean) as HTMLButtonElement[];
    if (buttons.length === 0) return;
    const current = buttons.findIndex((b) => b === document.activeElement);
    const next = Math.max(0, Math.min(buttons.length - 1, (current === -1 ? 0 : current) + delta));
    e.preventDefault();
    buttons[next]?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'j' || e.key === 'ArrowDown') move(1, e);
    else if (e.key === 'k' || e.key === 'ArrowUp') move(-1, e);
  }

  if (applications.length === 0 && isFiltered) {
    // An empty result is not an empty account. Saying "No applications yet" to
    // someone with 48 of them reads as data loss.
    return (
      <EmptyState
        icon={<SearchXIcon size={22} strokeWidth={1.5} />}
        title="No matching applications"
        description="Nothing here matches the current search and filters."
        action={
          onClearFilters && (
            <Button variant="outline" size="sm" onClick={onClearFilters}>
              Clear filters
            </Button>
          )
        }
      />
    );
  }

  if (applications.length === 0) {
    return (
      <EmptyState
        icon={<BriefcaseIcon size={22} strokeWidth={1.5} />}
        title="No applications yet"
        description="Every application you track here builds the history your CVs and cover letters are generated from."
        action={
          <Button size="sm" onClick={onAddClick}>
            Add application
          </Button>
        }
      />
    );
  }

  return (
    <ul
      aria-label="Applications"
      onKeyDown={handleKeyDown}
      style={{ listStyle: 'none', margin: 0, padding: 0 }}
    >
      {applications.map((app, idx) => {
        const isSelected = app.id === selectedId;
        const meta = [app.location, formatSourceSite(app.sourceSite), formatDate(app.appliedAt)]
          .filter(Boolean)
          .join(' \u00b7 ');

        return (
          <li
            key={app.id}
            onMouseEnter={() => setHoveredId(app.id)}
            onMouseLeave={() => setHoveredId(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              paddingRight: 'var(--space-4)',
              borderBottom: '1px solid var(--color-border)',
              backgroundColor: isSelected
                ? 'var(--color-surface-active)'
                : app.id === hoveredId
                  ? 'var(--color-surface-hover)'
                  : 'transparent',
            }}
          >
            <button
              type="button"
              ref={(el) => {
                buttonsRef.current[idx] = el;
              }}
              onClick={() => onRowClick(app.id)}
              style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-4)',
                padding: 'var(--space-3) var(--space-4)',
                background: 'none',
                border: 'none',
                font: 'inherit',
                color: 'inherit',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <CompanyAvatar company={app.company} />

              <span style={{ flex: 1, minWidth: 0, display: 'grid', gap: '1px' }}>
                <span
                  style={{
                    fontSize: 'var(--text-sm)',
                    fontWeight: 500,
                    color: 'var(--color-text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {app.company}
                </span>
                <span
                  style={{
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-text-secondary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {app.role}
                </span>
                {meta && (
                  <span
                    style={{
                      fontSize: 'var(--text-xs)',
                      color: 'var(--color-text-tertiary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {meta}
                  </span>
                )}
              </span>
            </button>

            {!app.sourceUrl && <span style={{ width: '56px', flexShrink: 0 }} />}
            {app.sourceUrl && (
              <a
                href={app.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-accent)',
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  width: '56px',
                  textAlign: 'right',
                }}
              >
                Posting
              </a>
            )}

            <span
              style={{
                flexShrink: 0,
                width: '104px',
                display: 'flex',
                justifyContent: 'flex-end',
              }}
            >
              <StatusSelect
                applicationId={app.id}
                currentStatus={app.status}
                onStatusChange={(s) => onStatusChange(app.id, s)}
              />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
