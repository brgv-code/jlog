import type { ApplicationStatus } from '@jlog/shared';
import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { renderMarkdown } from '../../lib/markdown';
import { Spinner } from '../ui/Spinner';
import { StatusSelect } from './StatusSelect';
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

function InlineField({
  label,
  value,
  fieldName,
  onSave,
  multiline,
}: {
  label: string;
  value: string;
  fieldName: EditableField;
  onSave: (field: EditableField, value: string) => Promise<void>;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  // Only used for the notes field: 'edit' | 'preview'
  const [notesMode, setNotesMode] = useState<'edit' | 'preview'>('edit');
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  // Focus the input/textarea when editing opens (avoids autoFocus lint rule)
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      textareaRef.current?.focus();
    }
  }, [editing]);

  async function save() {
    if (draft === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    await onSave(fieldName, draft);
    setSaving(false);
    setEditing(false);
  }

  const baseStyle = {
    width: '100%',
    backgroundColor: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--color-text-primary)',
    fontSize: 'var(--text-sm)',
    padding: '4px 8px',
    outline: 'none',
    fontFamily: 'var(--font-sans)',
  } as const;

  const toggleBtnStyle = (active: boolean) =>
    ({
      background: active ? 'var(--color-surface-raised)' : 'none',
      border: active ? '1px solid var(--color-border)' : '1px solid transparent',
      borderRadius: 'var(--radius-sm)',
      color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
      fontSize: 'var(--text-xs)',
      padding: '2px 8px',
      cursor: 'pointer',
    }) as const;

  if (multiline) {
    return (
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '4px',
          }}
        >
          <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{label}</span>
          <div style={{ display: 'flex', gap: '2px' }}>
            <button
              type="button"
              style={toggleBtnStyle(notesMode === 'edit')}
              onClick={() => {
                setNotesMode('edit');
                setEditing(true);
              }}
            >
              Edit
            </button>
            <button
              type="button"
              style={toggleBtnStyle(notesMode === 'preview')}
              onClick={() => {
                setNotesMode('preview');
                setEditing(false);
              }}
            >
              Preview
            </button>
          </div>
        </div>
        {notesMode === 'preview' ? (
          <div
            // Content is user-authored and sanitised by renderMarkdown before being set
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: renderMarkdown(draft || '') }}
            style={{
              fontSize: 'var(--text-sm)',
              color: draft ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              lineHeight: 1.6,
              minHeight: '60px',
            }}
          />
        ) : (
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            rows={4}
            style={{ ...baseStyle, resize: 'vertical' }}
          />
        )}
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 'var(--space-4)' }}>
      <span
        style={{
          display: 'block',
          fontSize: '11px',
          color: 'var(--color-text-secondary)',
          marginBottom: '2px',
        }}
      >
        {label}
      </span>
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') setEditing(false);
          }}
          style={baseStyle}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'text',
            textAlign: 'left',
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <span
            style={{
              fontSize: 'var(--text-sm)',
              color: value ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
            }}
          >
            {value || 'Click to edit…'}
          </span>
          {saving && <Spinner size={12} />}
        </button>
      )}
    </div>
  );
}

function generateFollowUpMessage(
  company: string,
  role: string,
  appliedAt: string | null,
  userName: string,
): string {
  const daysSince =
    appliedAt != null
      ? Math.floor((Date.now() - new Date(appliedAt).getTime()) / (1000 * 60 * 60 * 24))
      : null;
  const timePhrase =
    daysSince != null ? `${daysSince} day${daysSince === 1 ? '' : 's'} ago` : 'recently';
  return `Hi,

I wanted to follow up on my application for the ${role} position at ${company}. I applied ${timePhrase} and remain very interested in the opportunity.

Could you provide an update on the status of my application? I'm happy to share any additional information or answer questions.

Thank you for your time.

Best regards,
${userName}`;
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
    setFollowUpMessage(generateFollowUpMessage(app.company, app.role, app.appliedAt, userName));
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
      <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-12)' }}>
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

  const appliedDate = app.appliedAt
    ? new Date(app.appliedAt).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : '—';

  return (
    <div style={{ padding: 'var(--space-6)', maxWidth: '720px', margin: '0 auto' }}>
      <button
        type="button"
        onClick={onBack}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--color-text-secondary)',
          fontSize: 'var(--text-sm)',
          cursor: 'pointer',
          marginBottom: 'var(--space-6)',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}
      >
        ← Back
      </button>

      <div
        style={{
          marginBottom: 'var(--space-6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 600, letterSpacing: '-0.01em' }}>
            {app.company}
          </h2>
          <p
            style={{
              color: 'var(--color-text-secondary)',
              fontSize: 'var(--text-sm)',
              marginTop: '2px',
            }}
          >
            {app.role}
          </p>
        </div>
        <StatusSelect
          applicationId={app.id}
          currentStatus={app.status}
          onStatusChange={handleStatusChange}
        />
      </div>

      <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-6)' }}>
        <InlineField
          label="Company"
          value={app.company}
          fieldName="company"
          onSave={handleSaveField}
        />
        <InlineField label="Role" value={app.role} fieldName="role" onSave={handleSaveField} />
        <InlineField
          label="Location"
          value={app.location ?? ''}
          fieldName="location"
          onSave={handleSaveField}
        />
        <InlineField
          label="Source URL"
          value={app.sourceUrl ?? ''}
          fieldName="sourceUrl"
          onSave={handleSaveField}
        />

        <div style={{ marginBottom: 'var(--space-4)' }}>
          <span
            style={{
              display: 'block',
              fontSize: '11px',
              color: 'var(--color-text-secondary)',
              marginBottom: '2px',
            }}
          >
            Applied date
          </span>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
            {appliedDate}
          </span>
        </div>

        <div style={{ marginBottom: 'var(--space-4)' }}>
          <span
            style={{
              display: 'block',
              fontSize: '11px',
              color: 'var(--color-text-secondary)',
              marginBottom: '2px',
            }}
          >
            Salary range
          </span>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
            {app.salaryMin != null || app.salaryMax != null
              ? [
                  app.salaryMin != null ? app.salaryMin.toLocaleString() : '?',
                  app.salaryMax != null ? app.salaryMax.toLocaleString() : '?',
                ].join(' – ') + ` ${app.salaryCurrency ?? 'USD'}`
              : '—'}
          </span>
        </div>

        {app.responseReceivedAt && (
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <span
              style={{
                display: 'block',
                fontSize: '11px',
                color: 'var(--color-text-secondary)',
                marginBottom: '2px',
              }}
            >
              Response received
            </span>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
              {new Date(app.responseReceivedAt).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          </div>
        )}

        <InlineField
          label="Notes"
          value={app.notes ?? ''}
          fieldName="notes"
          onSave={handleSaveField}
          multiline
        />

        <InlineField
          label="Job Description"
          value={app.jobDescription ?? ''}
          fieldName="jobDescription"
          onSave={handleSaveField}
          multiline
        />
      </div>

      {/* Follow-up */}
      <div
        style={{
          marginTop: 'var(--space-6)',
          borderTop: '1px solid var(--color-border)',
          paddingTop: 'var(--space-4)',
        }}
      >
        {!showFollowUp ? (
          <button
            type="button"
            onClick={openFollowUp}
            style={{
              background: 'none',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-text-secondary)',
              fontSize: 'var(--text-xs)',
              padding: '4px 12px',
              cursor: 'pointer',
            }}
          >
            Send follow-up
          </button>
        ) : (
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 'var(--space-2)',
              }}
            >
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--color-text-secondary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                Follow-up message
              </span>
              <button
                type="button"
                onClick={() => setShowFollowUp(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-tertiary)',
                  fontSize: 'var(--text-xs)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
            <textarea
              value={followUpMessage}
              onChange={(e) => setFollowUpMessage(e.target.value)}
              rows={8}
              style={{
                width: '100%',
                backgroundColor: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-text-primary)',
                fontSize: 'var(--text-sm)',
                padding: '8px',
                fontFamily: 'var(--font-sans)',
                resize: 'vertical',
                outline: 'none',
                lineHeight: 1.6,
              }}
            />
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
              <button
                type="button"
                onClick={() => sendFollowUp('email')}
                disabled={followUpLogging}
                style={{
                  backgroundColor: 'var(--color-accent)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  color: '#fff',
                  fontSize: 'var(--text-xs)',
                  padding: '6px 14px',
                  cursor: 'pointer',
                }}
              >
                Open in Email
              </button>
              <button
                type="button"
                onClick={() => sendFollowUp('whatsapp')}
                disabled={followUpLogging}
                style={{
                  backgroundColor: '#25D366',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  color: '#fff',
                  fontSize: 'var(--text-xs)',
                  padding: '6px 14px',
                  cursor: 'pointer',
                }}
              >
                Send via WhatsApp
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Activity timeline */}
      <div
        style={{
          marginTop: 'var(--space-8)',
          borderTop: '1px solid var(--color-border)',
          paddingTop: 'var(--space-6)',
        }}
      >
        <h3
          style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 600,
            color: 'var(--color-text-secondary)',
            marginBottom: 'var(--space-4)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Activity
        </h3>
        <Timeline applicationId={applicationId} />
      </div>

      <div
        style={{
          marginTop: 'var(--space-8)',
          borderTop: '1px solid var(--color-border)',
          paddingTop: 'var(--space-4)',
        }}
      >
        <button
          type="button"
          onClick={handleDelete}
          style={{
            background: 'none',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            color: deleteConfirm ? '#F87171' : 'var(--color-text-secondary)',
            fontSize: 'var(--text-xs)',
            padding: '4px 12px',
            cursor: 'pointer',
          }}
        >
          {deleteConfirm ? 'Confirm delete' : 'Delete application'}
        </button>
        {deleteConfirm && (
          <button
            type="button"
            onClick={() => setDeleteConfirm(false)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-text-secondary)',
              fontSize: 'var(--text-xs)',
              marginLeft: 'var(--space-2)',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
