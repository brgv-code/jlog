import type { ApplicationStatus } from '@jlog/shared';
import {
  BriefcaseIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  MailIcon,
  PencilIcon,
  Trash2Icon,
  TypeIcon,
  WandSparklesIcon,
} from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { inferStructure } from '../../lib/jobText';
import { renderMarkdown } from '../../lib/markdown';
import { Spinner } from '../ui/Spinner';
import { Button } from '../ui/button';
import { CompanyAvatar } from './ApplicationsTable';
import { StatusSelect } from './StatusSelect';
import { TailorCvCard } from './TailorCvCard';
import { Timeline } from './Timeline';

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
  jobDescription: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  responseReceivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ApplicationDetailProps {
  applicationId: string;
  userName: string;
  onBack: () => void;
  onDelete: (id: string) => void;
  onUpdate: (app: Application) => void;
}

type EditableField = 'company' | 'role' | 'location' | 'sourceUrl' | 'notes' | 'jobDescription';
type DocTab = 'jobDescription' | 'notes';

const SECTION_HEADING: CSSProperties = {
  fontSize: 'var(--text-sm)',
  fontWeight: 600,
  color: 'var(--color-text-primary)',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatSalary(app: Application): string {
  if (app.salaryMin == null && app.salaryMax == null) return '—';
  const lo = app.salaryMin != null ? app.salaryMin.toLocaleString() : '?';
  const hi = app.salaryMax != null ? app.salaryMax.toLocaleString() : '?';
  return `${lo} – ${hi} ${app.salaryCurrency ?? 'USD'}`;
}

/**
 * One row of the properties rail: label left, value right, click the value to
 * edit it.
 *
 * Label and value share a line, the way a properties panel does, rather than
 * stacking with a tracked capital label above each value. Stacked, six short
 * facts took a screen's height and each label shouted louder than its value.
 */
function MetaRow({
  label,
  value,
  field,
  onSave,
  mono,
  placeholder = 'Not set',
}: {
  label: string;
  value: string;
  field?: EditableField;
  onSave?: (field: EditableField, value: string) => Promise<void>;
  mono?: boolean;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function save() {
    if (!field || !onSave || draft === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    await onSave(field, draft);
    setSaving(false);
    setEditing(false);
  }

  // One way of saying "nothing here" across the rail: a placeholder in the
  // body face, never a dash, and never in mono (mono means a value you copy).
  const empty = !value || value === '—';
  const shown = empty ? placeholder : value;
  const asCode = mono && !empty;
  const textStyle: CSSProperties = {
    fontFamily: asCode ? 'var(--font-mono)' : 'var(--font-sans)',
    fontSize: asCode ? 'var(--text-xs)' : 'var(--text-sm)',
    color: empty ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
  };

  let control: ReactNode;
  if (editing) {
    control = (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') {
            setDraft(value);
            setEditing(false);
          }
        }}
        style={{
          width: 'calc(100% + 6px)',
          height: '28px',
          marginLeft: '-6px',
          backgroundColor: 'var(--color-bg)',
          border: '1px solid var(--color-border-strong)',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--color-text-primary)',
          fontSize: 'var(--text-sm)',
          fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
          padding: '0 5px',
          outline: 'none',
        }}
      />
    );
  } else if (field) {
    control = (
      <button
        type="button"
        className="jd-prop-value"
        onClick={() => setEditing(true)}
        title={empty ? undefined : value}
        aria-label={`${label}: ${shown}. Click to edit`}
      >
        <span className={asCode ? 'jd-truncate' : 'jd-wrap'} style={textStyle}>
          {shown}
        </span>
        {saving && <Spinner size={11} />}
      </button>
    );
  } else {
    control = (
      <span className="jd-prop-value">
        <span className={asCode ? 'jd-truncate' : 'jd-wrap'} style={textStyle}>
          {shown}
        </span>
      </span>
    );
  }

  return (
    <div className="jd-prop">
      <span className="jd-prop-label">{label}</span>
      {control}
    </div>
  );
}

/**
 * The page title, editable in place.
 *
 * Company and role used to appear twice — once as the heading and again as rail
 * rows, purely so they had somewhere to be edited. Editing them where they are
 * displayed removes the duplicate.
 *
 * The display button and the input share the same 2px/6px inset, pulled back
 * by a negative margin, so entering edit mode does not move a single glyph.
 */
function EditableHeading({
  value,
  field,
  onSave,
  as: Tag,
  style,
}: {
  value: string;
  field: EditableField;
  onSave: (field: EditableField, value: string) => Promise<void>;
  as: 'h1' | 'p';
  style: CSSProperties;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  async function save() {
    if (draft !== value) await onSave(field, draft);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') {
            setDraft(value);
            setEditing(false);
          }
        }}
        style={{
          ...style,
          display: 'block',
          width: 'calc(100% + 12px)',
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border-strong)',
          borderRadius: 'var(--radius-md)',
          padding: '1px 5px',
          margin: '-2px -6px',
          fontFamily: 'var(--font-sans)',
          outline: 'none',
        }}
      />
    );
  }

  return (
    <Tag style={{ margin: 0 }}>
      <button
        type="button"
        className="jd-editable"
        onClick={() => setEditing(true)}
        title="Click to edit"
        style={{ ...style, fontFamily: 'var(--font-sans)' }}
      >
        {value}
      </button>
    </Tag>
  );
}

/**
 * The job description and notes, given the room they need.
 *
 * Both used to render into a four-row textarea, so a thousand-word posting was
 * read through a window four lines tall. Here reading is the default state and
 * fills the column; editing is a mode you enter on purpose.
 */
function DocPane({
  tab,
  onTabChange,
  jobDescription,
  notes,
  onSave,
}: {
  tab: DocTab;
  onTabChange: (t: DocTab) => void;
  jobDescription: string;
  notes: string;
  onSave: (field: EditableField, value: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [formatted, setFormatted] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const current = tab === 'jobDescription' ? jobDescription : notes;

  /*
   * Only the job description gets structure inferred. Notes are written by the
   * user in a textarea, so their markdown is deliberate and guessing at it
   * would fight them.
   *
   * The toggle appears only when inference actually changed something — on a
   * posting that already reads as markdown there is nothing to toggle between.
   */
  const inferred = tab === 'jobDescription' ? inferStructure(current) : current;
  const canToggle = tab === 'jobDescription' && inferred !== current;
  const shown = canToggle && !formatted ? current : inferred;

  useEffect(() => {
    if (editing) {
      setDraft(current);
      textareaRef.current?.focus();
    }
  }, [editing, current]);

  async function save() {
    setSaving(true);
    await onSave(tab, draft);
    setSaving(false);
    setEditing(false);
  }

  const TABS: { key: DocTab; label: string }[] = [
    { key: 'jobDescription', label: 'Job description' },
    { key: 'notes', label: 'Notes' },
  ];

  return (
    <section className="jd-doc" aria-label="Posting and notes">
      <div className="jd-tabs">
        <div role="tablist" style={{ display: 'flex', gap: 'var(--space-5)' }}>
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={key === tab}
              className="jd-tab"
              onClick={() => {
                setEditing(false);
                onTabChange(key);
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {editing ? (
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
            {canToggle && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFormatted((f) => !f)}
                aria-label={formatted ? 'Original' : 'Formatted'}
              >
                {formatted ? (
                  <>
                    <TypeIcon size={13} strokeWidth={1.75} />
                    <span className="jd-hide-narrow">Original</span>
                  </>
                ) : (
                  <>
                    <WandSparklesIcon size={13} strokeWidth={1.75} />
                    <span className="jd-hide-narrow">Formatted</span>
                  </>
                )}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              <PencilIcon size={13} strokeWidth={1.75} />
              Edit
            </Button>
          </div>
        )}
      </div>

      <div role="tabpanel" style={{ padding: 'var(--space-6) 0 0' }}>
        {editing ? (
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            style={{
              width: '100%',
              minHeight: '60vh',
              backgroundColor: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              color: 'var(--color-text-primary)',
              fontSize: 'var(--text-sm)',
              fontFamily: 'var(--font-sans)',
              lineHeight: 1.7,
              padding: 'var(--space-4)',
              outline: 'none',
              resize: 'vertical',
            }}
          />
        ) : current ? (
          <div
            className="jlog-prose"
            // renderMarkdown sanitises before returning.
            dangerouslySetInnerHTML={{ __html: renderMarkdown(shown) }}
          />
        ) : (
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
            {tab === 'jobDescription'
              ? 'No job description saved. Paste the posting here and tailoring can cite it.'
              : 'No notes yet. Anything you write here stays with the application.'}
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * Where you are, and the actions on the whole application.
 *
 * Replaces the list's breadcrumb bar while an application is open, so the
 * trail can name the application itself and the way back is the trail's own
 * first step rather than a separate link above the title.
 */
function Bar({
  company,
  onBack,
  children,
}: { company?: string; onBack: () => void; children?: ReactNode }) {
  return (
    <header className="jd-bar">
      <nav aria-label="Breadcrumb" className="jd-crumbs">
        <button
          type="button"
          className="jd-crumb-root"
          onClick={onBack}
          title="All applications"
          aria-label="All applications"
        >
          <BriefcaseIcon
            size={14}
            strokeWidth={1.75}
            style={{ color: 'var(--color-icon-applications)' }}
          />
          Applications
        </button>
        {company && (
          <>
            <ChevronRightIcon
              size={14}
              strokeWidth={1.75}
              aria-hidden="true"
              style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }}
            />
            <span className="jd-crumb-current" aria-current="page">
              {company}
            </span>
          </>
        )}
      </nav>
      {children && <div className="jd-actions">{children}</div>}
    </header>
  );
}

export function ApplicationDetail({
  applicationId,
  userName,
  onBack,
  onDelete,
  onUpdate,
}: ApplicationDetailProps) {
  const [app, setApp] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<DocTab>('jobDescription');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [followUpMessage, setFollowUpMessage] = useState('');
  const [followUpLogging, setFollowUpLogging] = useState(false);
  // Bumped after a follow-up is logged, so the feed shows the event it made.
  const [activityKey, setActivityKey] = useState(0);
  const followUpRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/api/applications/${applicationId}`)
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { application: Application };
        setApp(data.application);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [applicationId]);

  useEffect(() => {
    if (showFollowUp) followUpRef.current?.focus();
  }, [showFollowUp]);

  async function handleSaveField(field: EditableField, value: string) {
    const res = await apiFetch(`/api/applications/${applicationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
    if (res.ok) {
      const data = (await res.json()) as { application: Application };
      setApp(data.application);
      onUpdate(data.application);
      // Saving notes writes a note_added event; show it.
      if (field === 'notes') setActivityKey((k) => k + 1);
    }
  }

  function handleStatusChange(newStatus: ApplicationStatus) {
    if (!app) return;
    const updated = { ...app, status: newStatus };
    setApp(updated);
    onUpdate(updated);
    // The server writes a status_change event; show it.
    setActivityKey((k) => k + 1);
  }

  async function handleDelete() {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }
    await apiFetch(`/api/applications/${applicationId}`, { method: 'DELETE' });
    onDelete(applicationId);
  }

  function openFollowUp() {
    if (!app) return;
    const days =
      app.appliedAt != null
        ? Math.floor((Date.now() - new Date(app.appliedAt).getTime()) / 86400000)
        : null;
    const timePhrase = days != null ? `${days} day${days === 1 ? '' : 's'} ago` : 'recently';
    setFollowUpMessage(`Hi,

I wanted to follow up on my application for the ${app.role} position at ${app.company}. I applied ${timePhrase} and remain very interested in the opportunity.

Could you provide an update on the status of my application? I'm happy to share any additional information or answer questions.

Thank you for your time.

Best regards,
${userName}`);
    setShowFollowUp(true);
  }

  async function sendFollowUp(channel: 'email' | 'whatsapp') {
    if (!app) return;
    const encoded = encodeURIComponent(followUpMessage);
    if (channel === 'email') {
      const subject = encodeURIComponent(`Following up — ${app.role} at ${app.company}`);
      window.open(`mailto:?subject=${subject}&body=${encoded}`, '_blank');
    } else {
      window.open(`https://wa.me/?text=${encoded}`, '_blank');
    }
    setFollowUpLogging(true);
    await apiFetch(`/api/applications/${applicationId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel }),
    }).catch(() => {});
    setFollowUpLogging(false);
    setShowFollowUp(false);
    setActivityKey((k) => k + 1);
  }

  // The bar renders before the data (DESIGN.md rule 4), so the way back is
  // there from the first frame.
  if (loading || !app) {
    return (
      <div className="jd-host">
        <div className="jd">
          <Bar onBack={onBack} />
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-16)' }}>
              <Spinner />
            </div>
          ) : (
            <p style={{ color: 'var(--color-text-secondary)', padding: 'var(--space-8)' }}>
              Application not found.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="jd-host">
      {/*
        Rises on arrival. This panel replaces the list when a row is picked, and
        without it the swap is instant enough to leave you checking whether the
        click registered on the row you meant.
      */}
      <div className="jd jlog-rise">
        <Bar company={app.company} onBack={onBack}>
          {app.sourceUrl && (
            <Button variant="ghost" size="sm" asChild>
              <a
                href={app.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="View posting"
              >
                <ExternalLinkIcon size={13} strokeWidth={1.75} />
                <span className="jd-hide-narrow">View posting</span>
              </a>
            </Button>
          )}
          {deleteConfirm ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(false)}>
                Cancel
              </Button>
              <Button variant="destructive" size="sm" onClick={handleDelete}>
                <Trash2Icon size={13} strokeWidth={1.75} />
                Confirm delete
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              aria-label="Delete"
              title="Delete"
              className="w-8 px-0 has-[>svg]:px-0"
            >
              <Trash2Icon size={14} strokeWidth={1.75} />
            </Button>
          )}
        </Bar>

        <div className="jd-scroll">
          <div className="jd-grid">
            <div className="jd-head">
              <div style={{ marginBottom: 'var(--space-4)' }}>
                <CompanyAvatar company={app.company} showLogos size={40} />
              </div>
              <div style={{ display: 'grid', gap: 'var(--space-1)' }}>
                <EditableHeading
                  as="h1"
                  value={app.company}
                  field="company"
                  onSave={handleSaveField}
                  style={{
                    fontSize: 'var(--text-2xl)',
                    fontWeight: 600,
                    letterSpacing: '-0.02em',
                    lineHeight: 1.2,
                    color: 'var(--color-text-primary)',
                  }}
                />
                <EditableHeading
                  as="p"
                  value={app.role}
                  field="role"
                  onSave={handleSaveField}
                  style={{
                    fontSize: 'var(--text-base)',
                    lineHeight: 1.4,
                    color: 'var(--color-text-secondary)',
                  }}
                />
              </div>
            </div>

            <aside className="jd-rail" aria-label="Properties">
              <div className="jd-rail-inner">
                <div className="jd-rail-section jd-props">
                  <div className="jd-prop">
                    <span className="jd-prop-label">Status</span>
                    <span style={{ display: 'flex', alignItems: 'center', minHeight: '28px' }}>
                      <StatusSelect
                        applicationId={app.id}
                        currentStatus={app.status}
                        onStatusChange={handleStatusChange}
                      />
                    </span>
                  </div>
                  <MetaRow
                    label="Applied"
                    value={formatDate(app.appliedAt)}
                    placeholder="Not yet"
                  />
                  <MetaRow
                    label="Location"
                    value={app.location ?? ''}
                    field="location"
                    onSave={handleSaveField}
                  />
                  <MetaRow label="Salary" value={formatSalary(app)} />
                  {app.responseReceivedAt && (
                    <MetaRow label="Response received" value={formatDate(app.responseReceivedAt)} />
                  )}
                  <MetaRow
                    label="Source URL"
                    value={app.sourceUrl ?? ''}
                    field="sourceUrl"
                    onSave={handleSaveField}
                    mono
                    placeholder="Not linked"
                  />
                </div>

                <div className="jd-rail-section">
                  <TailorCvCard
                    applicationId={app.id}
                    company={app.company}
                    role={app.role}
                    jobDescription={app.jobDescription}
                  />
                </div>
              </div>
            </aside>

            <DocPane
              tab={tab}
              onTabChange={setTab}
              jobDescription={app.jobDescription ?? ''}
              notes={app.notes ?? ''}
              onSave={handleSaveField}
            />

            {/*
              Activity reads down to the composer, and the composer is the
              follow-up: the one thing you write on this page that becomes an
              event, written where that event will appear.
            */}
            <section className="jd-activity" aria-labelledby="jd-activity-heading">
              <h2
                id="jd-activity-heading"
                style={{ ...SECTION_HEADING, marginBottom: 'var(--space-5)' }}
              >
                Activity
              </h2>
              <Timeline applicationId={applicationId} refreshKey={activityKey} />

              <div style={{ marginTop: 'var(--space-6)' }}>
                {showFollowUp ? (
                  <div
                    className="jlog-rise"
                    style={{
                      border: '1px solid var(--color-border-strong)',
                      borderRadius: 'var(--radius-lg)',
                      backgroundColor: 'var(--color-bg)',
                      overflow: 'hidden',
                    }}
                  >
                    <label
                      htmlFor="jd-follow-up"
                      style={{
                        display: 'block',
                        padding: 'var(--space-3) var(--space-3) 0',
                        fontSize: 'var(--text-xs)',
                        fontWeight: 500,
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      Follow-up
                    </label>
                    <textarea
                      id="jd-follow-up"
                      ref={followUpRef}
                      value={followUpMessage}
                      onChange={(e) => setFollowUpMessage(e.target.value)}
                      rows={10}
                      style={{
                        display: 'block',
                        width: '100%',
                        backgroundColor: 'transparent',
                        border: 'none',
                        color: 'var(--color-text-primary)',
                        fontSize: 'var(--text-sm)',
                        fontFamily: 'var(--font-sans)',
                        lineHeight: 1.6,
                        padding: 'var(--space-2) var(--space-3) var(--space-3)',
                        outline: 'none',
                        resize: 'vertical',
                      }}
                    />
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        flexWrap: 'wrap',
                        gap: 'var(--space-2)',
                        padding: 'var(--space-2) var(--space-3)',
                        borderTop: '1px solid var(--color-border)',
                        backgroundColor: 'var(--color-surface)',
                      }}
                    >
                      <Button variant="ghost" size="sm" onClick={() => setShowFollowUp(false)}>
                        Cancel
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => sendFollowUp('whatsapp')}
                        disabled={followUpLogging}
                      >
                        WhatsApp
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => sendFollowUp('email')}
                        disabled={followUpLogging}
                      >
                        <MailIcon size={13} strokeWidth={1.75} />
                        Email
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="jd-composer-trigger" onClick={openFollowUp}>
                    <MailIcon size={14} strokeWidth={1.75} />
                    Draft a follow-up
                  </button>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
