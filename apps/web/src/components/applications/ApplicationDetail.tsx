import type { ApplicationStatus } from '@jlog/shared';
import {
  ArrowLeftIcon,
  ExternalLinkIcon,
  MailIcon,
  PencilIcon,
  Trash2Icon,
  TypeIcon,
  WandSparklesIcon,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { inferStructure } from '../../lib/jobText';
import { renderMarkdown } from '../../lib/markdown';
import { Spinner } from '../ui/Spinner';
import { Button } from '../ui/button';
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

const LABEL_STYLE: CSSProperties = {
  fontSize: '10px',
  fontWeight: 500,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: 'var(--color-text-tertiary)',
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
 * One row of the rail: label above, value below, click the value to edit.
 *
 * Short facts belong here precisely because they are short — they used to each
 * occupy a full-width block in the main column, which pushed the job
 * description, the thing the page is actually for, below the fold.
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

  const valueStyle: CSSProperties = {
    fontSize: 'var(--text-sm)',
    fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
    color: value ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
    overflowWrap: 'anywhere',
  };

  return (
    <div style={{ display: 'grid', gap: '3px' }}>
      <span style={LABEL_STYLE}>{label}</span>
      {editing ? (
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
            width: '100%',
            backgroundColor: 'var(--color-bg)',
            border: '1px solid var(--color-border-strong)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--color-text-primary)',
            fontSize: 'var(--text-sm)',
            fontFamily: 'var(--font-sans)',
            padding: '3px 6px',
            outline: 'none',
          }}
        />
      ) : field ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'text',
            textAlign: 'left',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            ...valueStyle,
          }}
        >
          {value || placeholder}
          {saving && <Spinner size={11} />}
        </button>
      ) : (
        <span style={valueStyle}>{value || placeholder}</span>
      )}
    </div>
  );
}

/**
 * The page title, editable in place.
 *
 * Company and role used to appear twice — once as the heading and again as rail
 * rows, purely so they had somewhere to be edited. Editing them where they are
 * displayed removes the duplicate.
 */
function EditableHeading({
  value,
  field,
  onSave,
  style,
}: {
  value: string;
  field: EditableField;
  onSave: (field: EditableField, value: string) => Promise<void>;
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
          width: '100%',
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border-strong)',
          borderRadius: 'var(--radius-sm)',
          padding: '1px 5px',
          margin: '-2px -6px',
          fontFamily: 'var(--font-sans)',
          outline: 'none',
        }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Click to edit"
      style={{
        ...style,
        display: 'block',
        background: 'none',
        border: 'none',
        padding: 0,
        textAlign: 'left',
        cursor: 'text',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {value}
    </button>
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
    <section style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-4)',
          padding: '0 var(--space-8)',
          borderBottom: '1px solid var(--color-border)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
          {TABS.map(({ key, label }) => {
            const active = key === tab;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setEditing(false);
                  onTabChange(key);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  // The underline sits on the element's own bottom edge so it
                  // lands on the container's hairline rather than above it.
                  borderBottom: `2px solid ${active ? 'var(--color-text-primary)' : 'transparent'}`,
                  marginBottom: '-1px',
                  padding: 'var(--space-4) 0',
                  fontSize: 'var(--text-sm)',
                  fontFamily: 'var(--font-sans)',
                  fontWeight: active ? 500 : 400,
                  color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            );
          })}
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
              <Button variant="ghost" size="sm" onClick={() => setFormatted((f) => !f)}>
                {formatted ? (
                  <>
                    <TypeIcon size={13} strokeWidth={1.75} />
                    Original
                  </>
                ) : (
                  <>
                    <WandSparklesIcon size={13} strokeWidth={1.75} />
                    Formatted
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

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: 'var(--space-6) var(--space-8) var(--space-16)',
        }}
      >
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
              borderRadius: 'var(--radius-md)',
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
            style={{ maxWidth: '72ch' }}
            // renderMarkdown sanitises before returning.
            dangerouslySetInnerHTML={{ __html: renderMarkdown(shown) }}
          />
        ) : (
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)' }}>
            {tab === 'jobDescription'
              ? 'No job description saved. Paste the posting here and tailoring can cite it.'
              : 'No notes yet. Anything you write here stays with the application.'}
          </p>
        )}
      </div>
    </section>
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
    }
  }

  function handleStatusChange(newStatus: ApplicationStatus) {
    if (!app) return;
    const updated = { ...app, status: newStatus };
    setApp(updated);
    onUpdate(updated);
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
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-16)' }}>
        <Spinner />
      </div>
    );
  }

  if (!app) {
    return (
      <p style={{ color: 'var(--color-text-secondary)', padding: 'var(--space-8)' }}>
        Application not found.
      </p>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 56px)',
        minHeight: 0,
      }}
    >
      {/* Identity bar */}
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 'var(--space-6)',
          padding: 'var(--space-2) var(--space-8) var(--space-5)',
          flexShrink: 0,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <button
            type="button"
            onClick={onBack}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              background: 'none',
              border: 'none',
              padding: 0,
              marginBottom: 'var(--space-3)',
              color: 'var(--color-text-secondary)',
              fontSize: 'var(--text-xs)',
              fontFamily: 'var(--font-sans)',
              cursor: 'pointer',
            }}
          >
            <ArrowLeftIcon size={13} strokeWidth={1.75} />
            All applications
          </button>
          <EditableHeading
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
            value={app.role}
            field="role"
            onSave={handleSaveField}
            style={{
              fontSize: 'var(--text-base)',
              color: 'var(--color-text-secondary)',
              marginTop: '2px',
            }}
          />
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            flexShrink: 0,
            paddingTop: 'var(--space-6)',
          }}
        >
          {app.sourceUrl && (
            <Button variant="outline" size="sm" asChild>
              <a href={app.sourceUrl} target="_blank" rel="noopener noreferrer">
                View posting
                <ExternalLinkIcon size={13} strokeWidth={1.75} />
              </a>
            </Button>
          )}
          <StatusSelect
            applicationId={app.id}
            currentStatus={app.status}
            onStatusChange={handleStatusChange}
          />
        </div>
      </header>

      <div
        style={{
          flex: 1,
          display: 'flex',
          minHeight: 0,
          borderTop: '1px solid var(--color-border)',
        }}
      >
        <DocPane
          tab={tab}
          onTabChange={setTab}
          jobDescription={app.jobDescription ?? ''}
          notes={app.notes ?? ''}
          onSave={handleSaveField}
        />

        <aside
          style={{
            width: '340px',
            flexShrink: 0,
            borderLeft: '1px solid var(--color-border)',
            overflowY: 'auto',
            padding: 'var(--space-6)',
            display: 'grid',
            gap: 'var(--space-6)',
            alignContent: 'start',
          }}
        >
          <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
            <MetaRow label="Applied" value={formatDate(app.appliedAt)} />
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

          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-6)' }}>
            <TailorCvCard
              applicationId={app.id}
              company={app.company}
              role={app.role}
              jobDescription={app.jobDescription}
            />
          </div>

          <div
            style={{
              borderTop: '1px solid var(--color-border)',
              paddingTop: 'var(--space-6)',
              display: 'grid',
              gap: 'var(--space-3)',
            }}
          >
            <span style={LABEL_STYLE}>Follow-up</span>
            {showFollowUp ? (
              <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
                <textarea
                  value={followUpMessage}
                  onChange={(e) => setFollowUpMessage(e.target.value)}
                  rows={10}
                  style={{
                    width: '100%',
                    backgroundColor: 'var(--color-bg)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--color-text-primary)',
                    fontSize: 'var(--text-xs)',
                    fontFamily: 'var(--font-sans)',
                    lineHeight: 1.6,
                    padding: 'var(--space-3)',
                    outline: 'none',
                    resize: 'vertical',
                  }}
                />
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  <Button
                    size="sm"
                    onClick={() => sendFollowUp('email')}
                    disabled={followUpLogging}
                  >
                    <MailIcon size={13} strokeWidth={1.75} />
                    Email
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => sendFollowUp('whatsapp')}
                    disabled={followUpLogging}
                  >
                    WhatsApp
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowFollowUp(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <Button variant="outline" size="sm" onClick={openFollowUp}>
                  Draft a follow-up
                </Button>
              </div>
            )}
          </div>

          <div
            style={{
              borderTop: '1px solid var(--color-border)',
              paddingTop: 'var(--space-6)',
              display: 'grid',
              gap: 'var(--space-3)',
            }}
          >
            <span style={LABEL_STYLE}>Activity</span>
            <Timeline applicationId={applicationId} />
          </div>

          <div
            style={{
              borderTop: '1px solid var(--color-border)',
              paddingTop: 'var(--space-6)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
            }}
          >
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              <Trash2Icon size={13} strokeWidth={1.75} />
              {deleteConfirm ? 'Confirm delete' : 'Delete'}
            </Button>
            {deleteConfirm && (
              <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(false)}>
                Cancel
              </Button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
