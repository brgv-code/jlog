import { describe, expect, it } from 'vitest';
import { parseMarkdownCv } from './markdown';

const CV = `# Ada Lovelace

Staff Engineer
ada@example.com | https://ada.dev
https://github.com/ada · https://linkedin.com/in/adalovelace

## Summary

Engineer with a decade on billing systems.

## Experience

### Staff Engineer — Acme (2017 – 2021)

- Cut p99 latency by 40% across the checkout path.
- Owned **billing** end to end, from [ledger](https://x.dev) to invoicing.

### Globex | Founding Engineer | 2021 - present

* Built the ingestion pipeline.

## Skills

- Languages: TypeScript, Go
- Cloud: Cloudflare, AWS

## Education

- BSc Mathematics, Cambridge
`;

describe('parseMarkdownCv', () => {
  it('reads the name from the top heading and contact from under it', () => {
    const { chrome } = parseMarkdownCv(CV);
    expect(chrome.firstName).toBe('Ada');
    expect(chrome.lastName).toBe('Lovelace');
    expect(chrome.title).toBe('Staff Engineer');
    expect(chrome.email).toBe('ada@example.com');
    expect(chrome.homepage).toBe('https://ada.dev');
    expect(chrome.socials).toEqual([
      { network: 'linkedin', handle: 'adalovelace' },
      { network: 'github', handle: 'ada' },
    ]);
  });

  it('reads each job under Experience as a role', () => {
    const { roles } = parseMarkdownCv(CV);
    expect(roles).toHaveLength(2);
    expect(roles[0]).toMatchObject({
      employer: 'Acme',
      roleTitle: 'Staff Engineer',
      dates: '2017--2021',
    });
    // Employer first, title second — the seniority word decides which is which.
    expect(roles[1]).toMatchObject({
      employer: 'Globex',
      roleTitle: 'Founding Engineer',
      dates: '2021--present',
    });
  });

  it('strips emphasis and link syntax out of a bullet', () => {
    const { roles } = parseMarkdownCv(CV);
    expect(roles[0]?.bullets).toEqual([
      'Cut p99 latency by 40% across the checkout path.',
      'Owned billing end to end, from ledger to invoicing.',
    ]);
  });

  it('splits a labelled list item into two columns', () => {
    const { chrome } = parseMarkdownCv(CV);
    expect(chrome.sections).toEqual([
      {
        heading: 'Skills',
        items: [
          { left: 'Languages', right: 'TypeScript, Go' },
          { left: 'Cloud', right: 'Cloudflare, AWS' },
        ],
      },
      { heading: 'Education', items: [{ left: '', right: 'BSc Mathematics, Cambridge' }] },
    ]);
  });

  it('takes Summary as prose, not as a section', () => {
    const { chrome } = parseMarkdownCv(CV);
    expect(chrome.summary).toBe('Engineer with a decade on billing systems.');
    expect(chrome.sections.map((s) => s.heading)).not.toContain('Summary');
  });

  // A heading level up ends the job list; without that, Skills reads as an
  // employer with two bullets.
  it('ends Experience at the next section', () => {
    const { roles } = parseMarkdownCv(CV);
    expect(roles.map((r) => r.employer)).not.toContain('Skills');
  });

  it('keeps a bullet that has no role above it instead of dropping it', () => {
    const { unplaced } = parseMarkdownCv('- A stray achievement.\n\n# Ada Lovelace');
    expect(unplaced).toEqual(['A stray achievement.']);
  });

  it('reads a CV with no name heading', () => {
    const { chrome, roles } = parseMarkdownCv(
      'Ada Lovelace\nada@example.com\n\n## Experience\n\n### Acme (2020)\n\n- Did the thing.',
    );
    expect(chrome.firstName).toBe('Ada');
    expect(chrome.email).toBe('ada@example.com');
    expect(roles[0]?.employer).toBe('Acme');
  });

  it('returns an empty import for empty input rather than throwing', () => {
    const { roles, chrome, unplaced } = parseMarkdownCv('');
    expect(roles).toEqual([]);
    expect(unplaced).toEqual([]);
    expect(chrome.firstName).toBe('');
  });
});
