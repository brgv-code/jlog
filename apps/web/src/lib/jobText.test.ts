import { describe, expect, it } from 'vitest';
import { inferStructure, looksLikeMarkdown } from './jobText';

describe('looksLikeMarkdown', () => {
  it('recognises a document that already has headings', () => {
    expect(looksLikeMarkdown('# Role\n\nText\n\n## Requirements\n\nMore')).toBe(true);
  });

  it('does not mistake a scraped posting for markdown', () => {
    expect(looksLikeMarkdown('About the role\n\nWe are hiring.\n\n• One\n• Two')).toBe(false);
  });
});

describe('inferStructure', () => {
  it('leaves real markdown untouched', () => {
    const md = '# Role\n\nSomething\n\n## Requirements\n\n- a\n- b';
    expect(inferStructure(md)).toBe(md);
  });

  it('promotes a colon-terminated line introducing a list', () => {
    const out = inferStructure('Requirements:\n• Five years of React\n• Strong CSS');
    expect(out).toContain('## Requirements');
    expect(out).toContain('- Five years of React');
  });

  it('promotes an all-caps line', () => {
    expect(inferStructure('BENEFITS\n\nHealth insurance.')).toContain('## BENEFITS');
  });

  it('promotes a standalone title-cased line', () => {
    expect(inferStructure('About The Role\n\nWe are hiring.')).toContain('## About The Role');
  });

  it('promotes a standalone sentence-case heading', () => {
    expect(inferStructure('About the role\n\nWe are hiring.')).toContain('## About the role');
  });

  it('promotes a sentence-case line that introduces a list', () => {
    const out = inferStructure('How we hire\n1. Intro call\n2. Deep dive');
    expect(out).toContain('## How we hire');
  });

  it('does not promote a wrapped first line that continues into prose', () => {
    const out = inferStructure('We are hiring an engineer\nto own the console.');
    expect(out).not.toContain('##');
  });

  it('converts typographic bullets to markdown ones', () => {
    const out = inferStructure('Tasks:\n▪ Ship things\n‣ Review code\n– Mentor');
    expect(out).toContain('- Ship things');
    expect(out).toContain('- Review code');
    expect(out).toContain('- Mentor');
  });

  it('keeps numbered lists ordered', () => {
    const out = inferStructure('Process:\n1. Screen\n2. Interview');
    expect(out).toContain('1. Screen');
    expect(out).toContain('1. Interview');
  });

  it('rejoins a paragraph that the board hard-wrapped mid-sentence', () => {
    const out = inferStructure(
      'We are looking for an engineer who can\nown a large codebase and set\ntechnical direction.',
    );
    expect(out).toBe(
      'We are looking for an engineer who can own a large codebase and set technical direction.',
    );
  });

  it('keeps separate sentences on separate lines as separate paragraphs', () => {
    const out = inferStructure('We build developer tools.\nThe team is small.');
    expect(out).toBe('We build developer tools.\n\nThe team is small.');
  });

  it('does not treat a long sentence as a heading', () => {
    const long =
      'We are looking for a Staff Frontend Engineer to help us build the next generation of tooling';
    expect(inferStructure(long)).not.toContain('##');
  });

  it('does not treat a URL as a heading', () => {
    expect(inferStructure('https://example.com/jobs/123')).not.toContain('##');
  });

  it('drops separator runs', () => {
    expect(inferStructure('Intro.\n\n-----\n\nMore.')).toBe('Intro.\n\nMore.');
  });

  it('returns empty for empty input', () => {
    expect(inferStructure('   ')).toBe('');
  });
});
