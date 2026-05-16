import type { ApplicationStatus } from '@jlog/shared';
import { APPLICATION_STATUSES } from '@jlog/shared';
import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { Spinner } from '../ui/Spinner';
import { StatusPill } from '../ui/StatusPill';

interface StatusSelectProps {
  applicationId: string;
  currentStatus: ApplicationStatus;
  onStatusChange: (newStatus: ApplicationStatus) => void;
}

export function StatusSelect({ applicationId, currentStatus, onStatusChange }: StatusSelectProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [optimistic, setOptimistic] = useState<ApplicationStatus>(currentStatus);
  const selectRef = useRef<HTMLSelectElement>(null);

  // Focus the select when editing opens (avoids autoFocus lint rule)
  useEffect(() => {
    if (editing) {
      selectRef.current?.focus();
    }
  }, [editing]);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value as ApplicationStatus;
    const previous = optimistic;
    setOptimistic(newStatus);
    setEditing(false);
    setSaving(true);

    try {
      const res = await apiFetch(`/api/applications/${applicationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        setOptimistic(previous);
        return;
      }
      onStatusChange(newStatus);
    } catch {
      setOptimistic(previous);
    } finally {
      setSaving(false);
    }
  }

  if (saving) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
        <StatusPill status={optimistic} />
        <Spinner size={12} />
      </span>
    );
  }

  if (editing) {
    return (
      <select
        ref={selectRef}
        value={optimistic}
        onChange={handleChange}
        onBlur={() => setEditing(false)}
        style={{
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--color-text-primary)',
          fontSize: 'var(--text-xs)',
          padding: '2px 6px',
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        {APPLICATION_STATUSES.map((s: ApplicationStatus) => (
          <option key={s} value={s}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </option>
        ))}
      </select>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        display: 'inline-flex',
      }}
      title="Click to change status"
    >
      <StatusPill status={optimistic} />
    </button>
  );
}
