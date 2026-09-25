import { type AutofillValuesInput, autofillValuesSchema } from '@jlog/shared';
import { CheckIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { Button } from '../ui/button';

/**
 * Answers the extension's autofill may use on questions a CV does not cover
 * (ADR-012 phase 2). The copy says exactly when each one is used, because the
 * rule the whole feature rests on is that jlog fills visa, pay and EEO
 * questions from what is saved here and from nothing else.
 */

const sectionStyle = {
  display: 'grid',
  gap: 'var(--space-4)',
  paddingBottom: 'var(--space-10)',
  marginBottom: 0,
} as const;

const headingStyle = {
  fontSize: 'var(--text-sm)',
  fontWeight: 600,
  color: 'var(--color-text-primary)',
  letterSpacing: '-0.01em',
} as const;

const helpStyle = {
  fontSize: 'var(--text-sm)',
  color: 'var(--color-text-secondary)',
  lineHeight: 1.6,
  maxWidth: '62ch',
} as const;

const noteStyle = {
  fontSize: 'var(--text-xs)',
  color: 'var(--color-text-tertiary)',
  lineHeight: 1.5,
} as const;

const fieldLabelStyle = {
  fontSize: 'var(--text-xs)',
  color: 'var(--color-text-secondary)',
} as const;

const inputStyle = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--color-text-primary)',
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--text-sm)',
  padding: '7px 10px',
  outline: 'none',
  width: '100%',
} as const;

const EMPTY: AutofillValuesInput = autofillValuesSchema.parse({});

/** "Germany, EU" in the box, ["Germany", "EU"] on the wire. */
const splitCountries = (s: string) =>
  s
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);

function Field({
  id,
  label,
  note,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  id: string;
  label: string;
  note: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-1)' }}>
      <label htmlFor={id} style={fieldLabelStyle}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        style={inputStyle}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      <span style={noteStyle}>{note}</span>
    </div>
  );
}

export function AutofillAnswers() {
  const [values, setValues] = useState<AutofillValuesInput>(EMPTY);
  // Kept as typed so "Germany, " does not snap to "Germany" mid-keystroke.
  const [countries, setCountries] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/api/profile/autofill')
      .then(async (res) => {
        if (!res.ok) throw new Error(`Could not load your answers (${res.status}).`);
        const data = (await res.json()) as { values: AutofillValuesInput };
        setValues(data.values);
        setCountries(data.values.authorizedCountries.join(', '));
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  const update = (patch: Partial<AutofillValuesInput>) => {
    setValues((v) => ({ ...v, ...patch }));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const body = { ...values, authorizedCountries: splitCountries(countries) };
      const res = await apiFetch('/api/profile/autofill', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(data.error?.message ?? `Could not save (${res.status}).`);
      }
      const data = (await res.json()) as { values: AutofillValuesInput };
      setValues(data.values);
      setCountries(data.values.authorizedCountries.join(', '));
      setSaved(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section style={sectionStyle}>
      <p style={headingStyle}>Application answers</p>
      <p style={helpStyle}>
        The extension's Fill button uses these on questions your CV does not answer. Anything left
        empty stays empty on the form. jlog never guesses these, and never answers questions about
        criminal history, visa type or date of birth.
      </p>

      {loading ? null : (
        <div style={{ display: 'grid', gap: 'var(--space-4)', maxWidth: '480px' }}>
          <Field
            id="af-phone"
            label="Phone"
            type="tel"
            note="Filled into phone fields."
            value={values.phone}
            placeholder="+49 30 1234567"
            onChange={(phone) => update({ phone })}
          />
          <Field
            id="af-countries"
            label="Where you can work without sponsorship"
            note="Comma separated. EU covers every member state. Used only when a question names one country: yes to authorisation there, no to sponsorship."
            value={countries}
            placeholder="Germany, EU"
            onChange={(c) => {
              setCountries(c);
              setSaved(false);
            }}
          />
          <Field
            id="af-salary"
            label="Salary expectation"
            note="Filled into free-text salary questions. Ranges in a dropdown are left for you."
            value={values.salaryExpectation}
            placeholder="85,000 EUR"
            onChange={(salaryExpectation) => update({ salaryExpectation })}
          />
          <Field
            id="af-notice"
            label="Notice period"
            note="Filled into notice period and start date questions that take text."
            value={values.noticePeriod}
            placeholder="3 months"
            onChange={(noticePeriod) => update({ noticePeriod })}
          />
          <label
            style={{
              display: 'flex',
              gap: 'var(--space-2)',
              alignItems: 'flex-start',
              fontSize: 'var(--text-sm)',
            }}
          >
            <input
              type="checkbox"
              checked={values.eeo === 'decline'}
              onChange={(e) => update({ eeo: e.target.checked ? 'decline' : '' })}
              style={{ marginTop: '3px' }}
            />
            <span>
              Decline to self-identify on EEO questions
              <span style={{ ...noteStyle, display: 'block' }}>
                Gender, race, veteran and disability. Picked only when the form offers exactly one
                "decline" option.
              </span>
            </span>
          </label>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save answers'}
            </Button>
            {saved ? (
              <span
                style={{ ...noteStyle, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                <CheckIcon size={12} strokeWidth={2} /> Saved
              </span>
            ) : null}
          </div>
        </div>
      )}
      {error ? (
        <p role="alert" style={{ ...noteStyle, color: 'var(--color-danger)' }}>
          {error}
        </p>
      ) : null}
    </section>
  );
}
