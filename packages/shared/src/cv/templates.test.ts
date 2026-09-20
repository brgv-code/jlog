import { describe, expect, it } from 'vitest';
import { CV_TEMPLATES, diffTemplates, isCvTemplate, templateConfig } from './templates';

describe('template configs', () => {
  it('never lets the US template carry a photo', () => {
    expect(templateConfig('us').chrome).not.toContain('photo');
  });

  it('gives every template a config', () => {
    for (const t of CV_TEMPLATES) expect(templateConfig(t).id).toBe(t);
  });

  it('falls back rather than returning undefined for an unknown id', () => {
    expect(templateConfig('mars' as never).id).toBe('europe');
  });

  it('recognises only real template ids', () => {
    expect(isCvTemplate('us')).toBe(true);
    expect(isCvTemplate('mars')).toBe(false);
    expect(isCvTemplate(null)).toBe(false);
  });
});

describe('diffTemplates', () => {
  it('reports what the US template drops, with the reason', () => {
    const d = diffTemplates('us', 'europe');
    const dropped = d.dropped.map((x) => x.field);
    expect(dropped).toContain('photo');
    expect(dropped).toContain('address');
    expect(d.dropped.find((x) => x.field === 'photo')?.note).toMatch(/discrimination/i);
  });

  it('reports a one-page target for the US', () => {
    expect(diffTemplates('us', 'europe').pageTarget).toBe(1);
  });

  it('notices a reordering even when the fields match', () => {
    const d = diffTemplates('india', 'europe');
    expect(d.dropped).toEqual([]);
    expect(d.added).toEqual([]);
    expect(d.reordered).toBe(true);
  });

  it('reports no change against itself', () => {
    const d = diffTemplates('us', 'us');
    expect(d.dropped).toEqual([]);
    expect(d.added).toEqual([]);
    expect(d.reordered).toBe(false);
  });
});
