import { describe, expect, it } from 'vitest';
import {
  CV_TEMPLATES,
  isCvTemplate,
  templateChips,
  templateConfig,
  templateStyle,
  templatesWithTag,
} from './templates';

describe('template configs', () => {
  it('gives every template a config, a blurb and a preview', () => {
    for (const id of CV_TEMPLATES) {
      const c = templateConfig(id);
      expect(c.id).toBe(id);
      expect(c.blurb.length).toBeGreaterThan(20);
      expect(c.preview).toMatch(/^\/templates\/.+\.pdf$/);
    }
  });

  it('only uses document classes the Tectonic image actually caches', () => {
    // The image warms `article` and `moderncv` and nothing else. Anything here
    // outside that pair is a cache miss at compile time in production.
    for (const id of CV_TEMPLATES) {
      expect(['moderncv', 'article']).toContain(templateConfig(id).documentClass);
    }
  });

  it('gives every moderncv template a style, and the article one none', () => {
    for (const id of CV_TEMPLATES) {
      const c = templateConfig(id);
      if (c.documentClass === 'moderncv') expect(c.style).toBeDefined();
      else expect(c.style).toBeUndefined();
    }
  });

  it('falls back rather than returning undefined for an unknown id', () => {
    expect(templateConfig('europe' as never).id).toBe('classic');
  });

  it('no longer recognises the country ids it used to store', () => {
    for (const old of ['europe', 'us', 'india']) expect(isCvTemplate(old)).toBe(false);
    expect(isCvTemplate('classic')).toBe(true);
  });
});

describe('templatesWithTag', () => {
  it('returns everything when no tag is selected', () => {
    expect(templatesWithTag(null)).toHaveLength(CV_TEMPLATES.length);
  });

  it('narrows without forbidding — every template stays reachable via some tag', () => {
    const reachable = new Set(
      CV_TEMPLATES.flatMap((id) => templateConfig(id).tags).flatMap((tag) =>
        templatesWithTag(tag).map((t) => t.id),
      ),
    );
    expect(reachable.size).toBe(CV_TEMPLATES.length);
  });

  it('finds the ATS-safe design', () => {
    expect(templatesWithTag('ATS-safe').map((t) => t.id)).toEqual(['plain']);
  });
});

describe('templateChips', () => {
  it('says one page for a one-page design', () => {
    expect(templateChips(templateConfig('plain'))).toContain('One page');
  });

  it('says no photo only where the layout truly cannot take one', () => {
    expect(templateChips(templateConfig('plain'))).toContain('No photo');
    expect(templateChips(templateConfig('banking'))).toContain('Photo off by default');
    expect(templateChips(templateConfig('classic'))).not.toContain('No photo');
  });
});

describe('templateStyle', () => {
  it('carries the class and style the renderer needs', () => {
    const s = templateStyle(templateConfig('banking'));
    expect(s.documentClass).toBe('moderncv');
    expect(s.style).toBe('banking');
  });

  it('never allows a photo on a design that cannot take one', () => {
    // Even when the caller asks for one explicitly.
    expect(templateStyle(templateConfig('plain'), true).chrome).not.toContain('photo');
  });

  it('honours the design default when the caller says nothing', () => {
    expect(templateStyle(templateConfig('classic')).chrome).toContain('photo');
    expect(templateStyle(templateConfig('banking')).chrome).not.toContain('photo');
  });

  it('lets a caller turn a photo on where the design supports it', () => {
    expect(templateStyle(templateConfig('banking'), true).chrome).toContain('photo');
  });

  it('passes the section order through', () => {
    expect(templateStyle(templateConfig('oldstyle')).sectionOrder[0]).toBe('Education');
  });
});
