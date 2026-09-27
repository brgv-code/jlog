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
  /**
   * Off for the landing page's demo, which has no session. Left on, every
   * change there fired an unauthenticated PATCH at the production API, took
   * the 401 as a failed save and snapped the pill back — so the one thing the
   * section invites you to do was the one thing that could not work.
   */
  persist?: boolean;
}

export function StatusSelect({
  applicationId,
  currentStatus,
  onStatusChange,
  persist = true,
}: StatusSelectProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [optimistic, setOptimistic] = useState<ApplicationStatus>(currentStatus);
  /*
   * Whether the user has just changed the status, held here rather than in the
   * pill. This component renders three different trees — editing, saving, idle
   * — so a pill cannot tell a change from its own first mount; this one can,
   * because it is what performed the change.
   */
  const [justChanged, setJustChanged] = useState(false);
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (!justChanged) return;
    // Long enough for the burst, which is the slower of the two.
    const t = setTimeout(() => setJustChanged(false), 1400);
    return () => clearTimeout(t);
  }, [justChanged]);

  // Focus the select when editing opens (avoids autoFocus lint rule)
  useEffect(() => {
    if (editing) {
      selectRef.current?.focus();
    }
  }, [editing]);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value as ApplicationStatus;
    const previous = optimistic;
    /*
     * Down first, always.
     *
     * Two bugs live here otherwise. A second edit begun within the flag's
     * lifetime would find it still true, so the pill shown *while saving*
     * animated a status the server had not accepted yet — picking "offer" could
     * fire the celebration and then roll back. And setting it true again while
     * it was already true is not a state change, so the clearing effect never
     * re-ran and the first edit's timer cut the second animation short.
     *
     * Clearing it here makes every change go false → true, which restarts both
     * the animation and its timer.
     */
    setJustChanged(false);
    setOptimistic(newStatus);
    setEditing(false);

    if (!persist) {
      onStatusChange(newStatus);
      return;
    }

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
      // Only on a change the server accepted: celebrating an offer that was
      // rolled back a moment later would be worse than not celebrating at all.
      if (newStatus !== previous) setJustChanged(true);
    } catch {
      setOptimistic(previous);
    } finally {
      setSaving(false);
    }
  }

  if (saving) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
        <StatusPill status={optimistic} changed={justChanged} />
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
      <StatusPill status={optimistic} changed={justChanged} />
    </button>
  );
}
