import type { ApplicationStatus } from '@jlog/shared';
import type { CSSProperties } from 'react';
import { useMemo, useState } from 'react';
import { ApplicationsTable } from '../applications/ApplicationsTable';
import {
  DEMO_APPLICATIONS,
  DEMO_BULLETS,
  DEMO_CV,
  DEMO_JD,
  DEMO_TARGET,
  type DemoApplication,
} from './demoData';

/**
 * The interactive demo on the landing page.
 *
 * The applications pane renders the *real* ApplicationsTable — same rows, same
 * monograms, same status control, same j/k navigation — against fixtures rather
 * than a fetch. That component is already presentational, so nothing had to be
 * loosened to get it here, and a visitor is looking at the shipped UI instead of
 * a drawing of it.
 *
 * The tailoring pane is built here rather than reusing GroundedCvView. That one
 * renders the source document through PdfPaper, which fetches the PDF with the
 * session cookie; a signed-out page has no honest way to satisfy it. So this is
 * a faithful reconstruction of the same idea against the same citation tokens —
 * and, unlike the old hand-drawn mock, it is labelled as a demo rather than
 * presented as a screenshot.
 *
 * Mounted client:visible, so none of this is on the critical path for a visitor
 * who never scrolls to it.
 */

type Pane = 'applications' | 'tailoring';
type SourceTab = 'cv' | 'jd';

const STATUS_TABS: { value: ApplicationStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'saved', label: 'Saved' },
  { value: 'applied', label: 'Applied' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'offer', label: 'Offer' },
];

const panel: CSSProperties = {
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-lg)',
  overflow: 'hidden',
  boxShadow: 'var(--shadow-md)',
};

const toolbar: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  padding: 'var(--space-3) var(--space-4)',
  borderBottom: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  flexWrap: 'wrap',
};

function segButton(active: boolean): CSSProperties {
  return {
    background: active ? 'var(--color-bg)' : 'none',
    border: '1px solid',
    borderColor: active ? 'var(--color-border)' : 'transparent',
    borderRadius: 'var(--radius-md)',
    color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
    fontWeight: active ? 500 : 400,
    fontSize: 'var(--text-sm)',
    fontFamily: 'var(--font-sans)',
    padding: '6px 14px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };
}

function pillButton(active: boolean): CSSProperties {
  return {
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
  };
}

export function ProductDemo() {
  const [pane, setPane] = useState<Pane>('applications');

  return (
    <div>
      {/* Segmented control, styled as the app's own toolbar rather than as marketing tabs. */}
      <div
        role="tablist"
        aria-label="Product demo"
        style={{
          display: 'inline-flex',
          gap: 'var(--space-1)',
          padding: '3px',
          marginBottom: 'var(--space-4)',
          background: 'var(--color-surface-raised)',
          borderRadius: 'var(--radius-lg)',
        }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={pane === 'applications'}
          onClick={() => setPane('applications')}
          style={segButton(pane === 'applications')}
        >
          Applications
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={pane === 'tailoring'}
          onClick={() => setPane('tailoring')}
          style={segButton(pane === 'tailoring')}
        >
          Tailored CV
        </button>
      </div>

      {pane === 'applications' ? <ApplicationsPane /> : <TailoringPane />}

      <p
        style={{
          marginTop: 'var(--space-3)',
          fontSize: 'var(--text-xs)',
          color: 'var(--color-text-tertiary)',
        }}
      >
        {pane === 'applications'
          ? 'Sample data — click a row, change a status, filter the list, or press j and k.'
          : 'Sample data — click any generated line to see the sentence it came from.'}
      </p>
    </div>
  );
}

function ApplicationsPane() {
  const [status, setStatus] = useState<ApplicationStatus | 'all'>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  // Status changes are local and real: the control writes back here, so the row
  // moves between filters exactly as it would against the API.
  const [rows, setRows] = useState<DemoApplication[]>(DEMO_APPLICATIONS);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== 'all' && r.status !== status) return false;
      if (!q) return true;
      return r.company.toLowerCase().includes(q) || r.role.toLowerCase().includes(q);
    });
  }, [rows, status, query]);

  return (
    <div style={panel}>
      <div style={toolbar}>
        <div style={{ display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap' }}>
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setStatus(tab.value)}
              style={pillButton(tab.value === status)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search company or role…"
          aria-label="Search the demo"
          style={{
            marginLeft: 'auto',
            backgroundColor: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-text-primary)',
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--text-sm)',
            padding: '6px 10px',
            outline: 'none',
            width: '200px',
            maxWidth: '100%',
          }}
        />
      </div>

      <ApplicationsTable
        applications={filtered}
        onRowClick={(id) => setSelectedId((prev) => (prev === id ? undefined : id))}
        selectedId={selectedId}
        onStatusChange={(id, next) =>
          setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: next } : r)))
        }
        onAddClick={() => undefined}
        isFiltered={status !== 'all' || query.trim() !== ''}
        onClearFilters={() => {
          setStatus('all');
          setQuery('');
        }}
        showLogos={false}
      />
    </div>
  );
}

function TailoringPane() {
  const [selected, setSelected] = useState<string | null>('b1');
  const [tab, setTab] = useState<SourceTab>('cv');

  const active = DEMO_BULLETS.find((b) => b.id === selected) ?? null;
  const blocks = tab === 'cv' ? DEMO_CV : DEMO_JD;
  const activeRef = active ? (tab === 'cv' ? active.cvRef : active.jdRef) : null;
  const ink = tab === 'cv' ? 'var(--color-cite-cv)' : 'var(--color-cite-jd)';
  const fill = tab === 'cv' ? 'var(--color-cite-cv-fill)' : 'var(--color-cite-jd-fill)';

  return (
    <div
      style={{ ...panel, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}
    >
      {/* Generated side */}
      <div style={{ borderRight: '1px solid var(--color-border)', minWidth: 0 }}>
        <div style={{ ...toolbar, justifyContent: 'space-between' }}>
          <span
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'var(--color-text-secondary)',
            }}
          >
            Generated
          </span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
            {DEMO_TARGET.company} · {DEMO_TARGET.role}
          </span>
        </div>

        <ul style={{ listStyle: 'none', margin: 0, padding: 'var(--space-2)' }}>
          {DEMO_BULLETS.map((b) => {
            const on = b.id === selected;
            return (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => setSelected(b.id)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    background: on ? 'var(--color-surface-raised)' : 'none',
                    border: '1px solid',
                    borderColor: on ? 'var(--color-border)' : 'transparent',
                    borderRadius: 'var(--radius-md)',
                    padding: 'var(--space-3)',
                    font: 'inherit',
                    fontSize: 'var(--text-sm)',
                    lineHeight: 1.6,
                    color: 'var(--color-text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  {b.text}
                  {on && (
                    <span
                      style={{
                        display: 'flex',
                        gap: 'var(--space-3)',
                        marginTop: 'var(--space-2)',
                        fontSize: 'var(--text-xs)',
                      }}
                    >
                      <Source label="your CV" colour="var(--color-cite-cv)" active={tab === 'cv'} />
                      <Source
                        label="the posting"
                        colour="var(--color-cite-jd)"
                        active={tab === 'jd'}
                      />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Source side */}
      <div style={{ minWidth: 0, background: 'var(--color-paper)' }}>
        <div style={toolbar}>
          {(
            [
              ['cv', 'Your CV'],
              ['jd', 'Job description'],
            ] as [SourceTab, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              style={pillButton(tab === value)}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ padding: 'var(--space-4)' }}>
          {blocks.map((block) => {
            const on = block.id === activeRef;
            return (
              <p
                key={block.id}
                style={{
                  fontSize: 'var(--text-sm)',
                  lineHeight: 1.65,
                  padding: 'var(--space-2)',
                  borderRadius: 'var(--radius-sm)',
                  // The unmatched blocks stay legible rather than being dimmed
                  // to near-nothing: the point is that the match sits in a real
                  // document, which needs the rest of the document to be there.
                  color: on ? 'var(--color-paper-ink)' : 'var(--color-text-secondary)',
                  background: on ? fill : 'transparent',
                  boxShadow: on ? `inset 2px 0 0 ${ink}` : 'none',
                  transition: 'background 150ms ease-out, color 150ms ease-out',
                }}
              >
                {block.text}
              </p>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Source({ label, colour, active }: { label: string; colour: string; active: boolean }) {
  return (
    // An indicator, not a control. The source panel's own tabs already switch
    // documents; making these clickable too would mean an interactive element
    // nested inside the bullet's button, which is invalid markup and needs a
    // keyboard handler to be reachable anyway.
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        color: active ? colour : 'var(--color-text-tertiary)',
        fontWeight: active ? 500 : 400,
      }}
    >
      <span
        style={{
          width: '8px',
          height: '8px',
          borderRadius: 'var(--radius-full)',
          background: colour,
          display: 'inline-block',
        }}
      />
      {label}
    </span>
  );
}
