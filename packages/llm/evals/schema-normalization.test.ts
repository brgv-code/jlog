import { describe, expect, it } from 'vitest';
import { extractedJobSchema } from '../src/index';

// extractedJobSchema is the last line of defense between whatever shape a model
// actually returns and the fields that land in the dashboard. These tests pin
// down its normalization rules directly, offline, with no API calls — separate
// from whether the model's *judgment* about a page was correct (see
// extraction.eval.test.ts for that).
describe('extractedJobSchema normalization', () => {
  it('normalizes a null company/role to an empty string', () => {
    const result = extractedJobSchema.parse({
      company: null,
      role: null,
      location: null,
      confidence: 0.9,
    });
    expect(result.company).toBe('');
    expect(result.role).toBe('');
  });

  it('normalizes a missing company/role key the same way as null', () => {
    // Some providers omit a field entirely instead of sending null for it.
    const result = extractedJobSchema.parse({ location: null, confidence: 0.9 });
    expect(result.company).toBe('');
    expect(result.role).toBe('');
  });

  it('normalizes an empty-string location to null', () => {
    const result = extractedJobSchema.parse({
      company: 'Acme',
      role: 'Engineer',
      location: '',
      confidence: 0.9,
    });
    expect(result.location).toBeNull();
  });

  it('normalizes a missing location key to null', () => {
    const result = extractedJobSchema.parse({ company: 'Acme', role: 'Engineer', confidence: 0.9 });
    expect(result.location).toBeNull();
  });

  it('keeps a real location string untouched', () => {
    const result = extractedJobSchema.parse({
      company: 'Acme',
      role: 'Engineer',
      location: 'Chicago, IL',
      confidence: 0.9,
    });
    expect(result.location).toBe('Chicago, IL');
  });

  it('coerces a stringified confidence into a number', () => {
    const result = extractedJobSchema.parse({
      company: 'Acme',
      role: 'Engineer',
      location: null,
      confidence: '0.85',
    });
    expect(result.confidence).toBe(0.85);
  });

  it('falls back to 0.5 for a non-numeric confidence', () => {
    const result = extractedJobSchema.parse({
      company: 'Acme',
      role: 'Engineer',
      location: null,
      confidence: 'high',
    });
    expect(result.confidence).toBe(0.5);
  });

  it('falls back to 0.5 for an out-of-range confidence', () => {
    const result = extractedJobSchema.parse({
      company: 'Acme',
      role: 'Engineer',
      location: null,
      confidence: 1.5,
    });
    expect(result.confidence).toBe(0.5);
  });

  it('falls back to 0.5 for a missing confidence', () => {
    const result = extractedJobSchema.parse({ company: 'Acme', role: 'Engineer', location: null });
    expect(result.confidence).toBe(0.5);
  });

  it('keeps unknown fields the model adds anyway (passthrough)', () => {
    const result = extractedJobSchema.parse({
      company: 'Acme',
      role: 'Engineer',
      location: null,
      confidence: 0.9,
      salary: '120k',
    });
    expect(result).toMatchObject({ salary: '120k' });
  });
});
