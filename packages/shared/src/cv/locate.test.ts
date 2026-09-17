import { describe, expect, it } from 'vitest';
import { normalise } from './ids';
import { locateAll, locateInSource } from './locate';

/** What the fold has to agree with, since the match is computed in its terms. */
const SAMPLE =
  '  Senior Engineer,   Acme\n\n• Cut p99 latency by 40%\n   across the checkout path.\n';

describe('locateInSource', () => {
  it('finds text that wrapped across lines in the source', () => {
    const span = locateInSource(SAMPLE, 'Cut p99 latency by 40% across the checkout path.');
    expect(span).not.toBeNull();
    expect(SAMPLE.slice(...(span as [number, number]))).toBe(
      'Cut p99 latency by 40%\n   across the checkout path.',
    );
  });

  it('ignores case and collapsed whitespace', () => {
    const span = locateInSource(SAMPLE, '  senior    engineer,\nacme ');
    expect(SAMPLE.slice(...(span as [number, number]))).toBe('Senior Engineer,   Acme');
  });

  it('returns null for words the source does not contain', () => {
    expect(locateInSource(SAMPLE, 'Improved consistency across all products')).toBeNull();
  });

  it('returns null for an empty needle rather than matching at 0', () => {
    expect(locateInSource(SAMPLE, '   ')).toBeNull();
  });

  it('prefers a match after the cursor when the line repeats', () => {
    const doubled = 'Led the migration.\nOther work.\nLed the migration.';
    const first = locateInSource(doubled, 'Led the migration.') as [number, number];
    const second = locateInSource(doubled, 'Led the migration.', first[1]) as [number, number];
    expect(first[0]).toBe(0);
    expect(second[0]).toBe(doubled.lastIndexOf('Led the migration.'));
  });

  it('falls back to the whole document when nothing follows the cursor', () => {
    const span = locateInSource(SAMPLE, 'Senior Engineer', SAMPLE.length);
    expect(span?.[0]).toBe(SAMPLE.indexOf('Senior'));
  });

  it('folds exactly as normalise does, so offsets land on real characters', () => {
    const span = locateInSource(SAMPLE, normalise(SAMPLE)) as [number, number];
    expect(span).not.toBeNull();
    expect(SAMPLE.slice(span[0], span[1]).trim()).toBe(SAMPLE.trim());
  });
});

describe('locateAll', () => {
  it('walks forward so repeated bullets resolve to successive lines', () => {
    const source = 'Shipped the thing.\nShipped the thing.\nShipped the thing.';
    const spans = locateAll(source, ['Shipped the thing.', 'Shipped the thing.']);
    expect(spans[0]?.[0]).toBe(0);
    expect(spans[1]?.[0]).toBe(19);
  });

  it('reports a miss without consuming the cursor', () => {
    const source = 'One.\nTwo.';
    const spans = locateAll(source, ['One.', 'Nowhere in here.', 'Two.']);
    expect(spans[0]).toEqual([0, 4]);
    expect(spans[1]).toBeNull();
    expect(source.slice(...(spans[2] as [number, number]))).toBe('Two.');
  });
});
