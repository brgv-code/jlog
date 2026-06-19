import type { ApplicationStatus } from '@jlog/shared';
import { APPLICATION_STATUSES } from '@jlog/shared';
import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../lib/api';

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

interface AddApplicationDialogProps {
  onSuccess: (application: Application) => void;
  onClose: () => void;
}

interface FormErrors {
  company?: string;
  role?: string;
  sourceUrl?: string;
}

export function AddApplicationDialog({ onSuccess, onClose }: AddApplicationDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [location, setLocation] = useState('');
  const [status, setStatus] = useState<ApplicationStatus>('saved');
  const [appliedAt, setAppliedAt] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [salaryMin, setSalaryMin] = useState('');
  const [salaryMax, setSalaryMax] = useState('');
  const [salaryCurrency, setSalaryCurrency] = useState('USD');

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  function validate(): boolean {
    const errs: FormErrors = {};
    if (!company.trim()) errs.company = 'Company is required';
    if (!role.trim()) errs.role = 'Role is required';
    if (sourceUrl && !sourceUrl.startsWith('http')) errs.sourceUrl = 'Must be a valid URL';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);

    const body: Record<string, unknown> = {
      company: company.trim(),
      role: role.trim(),
      status,
    };
    if (location.trim()) body.location = location.trim();
    if (sourceUrl.trim()) body.sourceUrl = sourceUrl.trim();
    if (notes.trim()) body.notes = notes.trim();
    if (appliedAt) body.appliedAt = Math.floor(new Date(appliedAt).getTime() / 1000);
    if (salaryMin) body.salaryMin = Number.parseInt(salaryMin, 10);
    if (salaryMax) body.salaryMax = Number.parseInt(salaryMax, 10);
    body.salaryCurrency = salaryCurrency;

    try {
      const res = await apiFetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error: { message: string } };
        setErrors({ company: err.error?.message ?? 'Failed to save' });
        return;
      }
      const data = (await res.json()) as { application: Application };
      onSuccess(data.application);
      dialogRef.current?.close();
    } finally {
      setSaving(false);
    }
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) {
      dialogRef.current?.close();
      onClose();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDialogElement>) {
    if (e.key === 'Escape') {
      onClose();
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '6px 10px',
    backgroundColor: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--color-text-primary)',
    fontSize: 'var(--text-sm)',
    outline: 'none',
  } as const;

  const labelStyle = {
    display: 'block',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-text-secondary)',
    marginBottom: 'var(--space-1)',
  } as const;

  const errorStyle = {
    fontSize: 'var(--text-xs)',
    color: '#F87171',
    marginTop: '2px',
  } as const;

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      onClose={onClose}
      style={{
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-6)',
        width: '480px',
        maxWidth: '90vw',
        color: 'var(--color-text-primary)',
      }}
    >
      <h2
        style={{
          fontSize: 'var(--text-base)',
          fontWeight: 600,
          marginBottom: 'var(--space-6)',
        }}
      >
        Add application
      </h2>
      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
      >
        <div>
          <label htmlFor="add-company" style={labelStyle}>
            Company *
          </label>
          <input
            id="add-company"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            style={inputStyle}
          />
          {errors.company && <p style={errorStyle}>{errors.company}</p>}
        </div>
        <div>
          <label htmlFor="add-role" style={labelStyle}>
            Role *
          </label>
          <input
            id="add-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            style={inputStyle}
          />
          {errors.role && <p style={errorStyle}>{errors.role}</p>}
        </div>
        <div>
          <label htmlFor="add-location" style={labelStyle}>
            Location
          </label>
          <input
            id="add-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label htmlFor="add-status" style={labelStyle}>
            Status
          </label>
          <select
            id="add-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as ApplicationStatus)}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            {APPLICATION_STATUSES.map((s: ApplicationStatus) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="add-applied-at" style={labelStyle}>
            Applied date
          </label>
          <input
            id="add-applied-at"
            type="date"
            value={appliedAt}
            onChange={(e) => setAppliedAt(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label htmlFor="add-source-url" style={labelStyle}>
            Source URL
          </label>
          <input
            id="add-source-url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            style={inputStyle}
            placeholder="https://"
          />
          {errors.sourceUrl && <p style={errorStyle}>{errors.sourceUrl}</p>}
        </div>
        <div>
          <label htmlFor="add-salary-min" style={labelStyle}>
            Salary range
          </label>
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
            <input
              id="add-salary-min"
              type="number"
              value={salaryMin}
              onChange={(e) => setSalaryMin(e.target.value)}
              placeholder="Min"
              style={{ ...inputStyle, flex: 1 }}
            />
            <span style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)' }}>
              –
            </span>
            <input
              id="add-salary-max"
              type="number"
              value={salaryMax}
              onChange={(e) => setSalaryMax(e.target.value)}
              placeholder="Max"
              style={{ ...inputStyle, flex: 1 }}
            />
            <select
              value={salaryCurrency}
              onChange={(e) => setSalaryCurrency(e.target.value)}
              style={{ ...inputStyle, width: '72px', cursor: 'pointer' }}
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
              <option value="INR">INR</option>
              <option value="CAD">CAD</option>
              <option value="AUD">AUD</option>
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="add-notes" style={labelStyle}>
            Notes
          </label>
          <textarea
            id="add-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 'var(--space-3)',
            marginTop: 'var(--space-2)',
          }}
        >
          <button
            type="button"
            onClick={() => {
              dialogRef.current?.close();
              onClose();
            }}
            style={{
              background: 'none',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-text-secondary)',
              fontSize: 'var(--text-sm)',
              padding: '6px 16px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            style={{
              backgroundColor: 'var(--color-accent)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              color: '#fff',
              fontSize: 'var(--text-sm)',
              padding: '6px 16px',
              cursor: saving ? 'wait' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Add application'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
