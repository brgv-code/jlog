import { describe, expect, it } from 'vitest';
import { normaliseCompany } from './companyLogo';

describe('normaliseCompany', () => {
  it('collapses the ways one company gets written', () => {
    const keys = ['Stripe', 'stripe', 'Stripe Inc.', 'Stripe, Inc', '  Stripe  '].map(
      normaliseCompany,
    );
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe('stripe');
  });

  it('strips the legal suffixes people write inconsistently', () => {
    expect(normaliseCompany('Acme GmbH')).toBe('acme');
    expect(normaliseCompany('Acme Ltd')).toBe('acme');
    expect(normaliseCompany('Acme LLC')).toBe('acme');
  });

  it('keeps distinct companies distinct', () => {
    expect(normaliseCompany('Linear')).not.toBe(normaliseCompany('Linear Labs'));
  });

  it('does not strip a suffix that is part of a word', () => {
    // "Incident" starts with "inc" — a substring match would mangle it.
    expect(normaliseCompany('Incident.io')).toBe('incident-io');
  });

  it('handles accents and punctuation', () => {
    expect(normaliseCompany('Zürich Insurance')).toBe('zurich-insurance');
    expect(normaliseCompany('H&M')).toBe('h-m');
  });

  it('returns empty for a nameless company rather than a stray key', () => {
    expect(normaliseCompany('   ')).toBe('');
    expect(normaliseCompany('Inc.')).toBe('');
  });
});
