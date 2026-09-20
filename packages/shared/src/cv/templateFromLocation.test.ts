import { describe, expect, it } from 'vitest';
import { suggestTemplate } from './templateFromLocation';

describe('suggestTemplate', () => {
  it('reads an explicit US state after a comma', () => {
    const s = suggestTemplate('San Francisco, CA');
    expect(s.template).toBe('us');
    expect(s.confident).toBe(true);
    expect(s.reason).toBe('San Francisco, CA');
  });

  it('reads a spelled-out country', () => {
    expect(suggestTemplate('Austin, United States').template).toBe('us');
    expect(suggestTemplate('Remote — India').template).toBe('india');
    expect(suggestTemplate('Berlin, Germany').template).toBe('europe');
  });

  it('reads a well-known city', () => {
    expect(suggestTemplate('Berlin, DE').template).toBe('europe');
    expect(suggestTemplate('Bangalore').template).toBe('india');
    expect(suggestTemplate('London, UK').template).toBe('europe');
  });

  it('does not read Indiana as India', () => {
    const s = suggestTemplate('Indianapolis, IN');
    expect(s.template).toBe('us');
  });

  it('does not read a two-letter state out of a city name', () => {
    // "DE" after the comma is Germany here, not Delaware — Europe words win
    // because the state check only fires on a bare token after the comma.
    expect(suggestTemplate('Berlin, DE').template).toBe('europe');
  });

  it('falls back when the location carries no market', () => {
    for (const vague of ['Remote', 'Anywhere', 'Hybrid', '']) {
      const s = suggestTemplate(vague);
      expect(s.confident).toBe(false);
      expect(s.reason).toBeNull();
      expect(s.template).toBe('europe');
    }
  });

  it('honours the caller fallback when nothing matches', () => {
    expect(suggestTemplate('Remote', 'india').template).toBe('india');
    expect(suggestTemplate(null, 'us').template).toBe('us');
  });

  it('treats Remote — EU as Europe', () => {
    expect(suggestTemplate('Remote — EU').template).toBe('europe');
  });

  it('never guesses from an empty or missing location', () => {
    expect(suggestTemplate(undefined).confident).toBe(false);
    expect(suggestTemplate('   ').confident).toBe(false);
  });
});
