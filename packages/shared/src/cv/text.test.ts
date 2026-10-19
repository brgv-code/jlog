import { describe, expect, it } from 'vitest';
import { missingSections, parseTextCv, withSections } from './text';
import { EMPTY_CHROME, type ImportedCv } from './types';

/** What unpdf actually returns for a one-page CV, layout flattened to lines. */
const CV = `Ada Lovelace
ada@example.com
https://ada.dev

EXPERIENCE

Staff Engineer, Acme  2017 - 2021
- Cut p99 latency by 40% across the checkout path.
- Owned billing end to end, from ledger to invoicing.

Founding Engineer, Globex  2021 - Present
• Built the ingestion pipeline that now carries every event.

SKILLS
Languages: TypeScript, Go
Cloud: Cloudflare, AWS

EDUCATION
BSc Mathematics, Cambridge`;

describe('parseTextCv', () => {
  it('reads the name and contact details above the first heading', () => {
    const { chrome } = parseTextCv(CV);
    expect(chrome.firstName).toBe('Ada');
    expect(chrome.lastName).toBe('Lovelace');
    expect(chrome.email).toBe('ada@example.com');
    expect(chrome.homepage).toBe('https://ada.dev');
  });

  it('reads a line carrying a date range as a job', () => {
    const { roles } = parseTextCv(CV);
    expect(roles).toHaveLength(2);
    expect(roles[0]).toMatchObject({
      employer: 'Acme',
      roleTitle: 'Staff Engineer',
      dates: '2017--2021',
    });
    expect(roles[1]).toMatchObject({ employer: 'Globex', dates: '2021--present' });
  });

  it('takes bullets written with any of the markers a PDF leaves behind', () => {
    const { roles } = parseTextCv(CV);
    expect(roles[0]?.bullets).toEqual([
      'Cut p99 latency by 40% across the checkout path.',
      'Owned billing end to end, from ledger to invoicing.',
    ]);
    // A bullet point, not a dash.
    expect(roles[1]?.bullets).toEqual([
      'Built the ingestion pipeline that now carries every event.',
    ]);
  });

  it('reads the blocks after Experience as sections', () => {
    const { chrome } = parseTextCv(CV);
    expect(chrome.sections).toEqual([
      {
        heading: 'SKILLS',
        items: [
          { left: 'Languages', right: 'TypeScript, Go' },
          { left: 'Cloud', right: 'Cloudflare, AWS' },
        ],
      },
      { heading: 'EDUCATION', items: [{ left: '', right: 'BSc Mathematics, Cambridge' }] },
    ]);
  });

  it('does not read a heading as a job', () => {
    const { roles } = parseTextCv(CV);
    expect(roles.map((r) => r.employer)).not.toContain('SKILLS');
  });

  it('takes a Summary block as prose', () => {
    const { chrome } = parseTextCv('Ada Lovelace\n\nSUMMARY\nEngineer.\nA decade on billing.');
    expect(chrome.summary).toBe('Engineer. A decade on billing.');
  });

  // Without a job above it there is nowhere to hang an achievement, and
  // dropping it would look exactly like the CV never having it.
  it('keeps an achievement written before any job', () => {
    const { unplaced } = parseTextCv(
      'Ada Lovelace\n\nEXPERIENCE\n- Shipped something notable and long enough to count.',
    );
    expect(unplaced).toEqual(['Shipped something notable and long enough to count.']);
  });

  it('returns an empty reading rather than throwing on junk', () => {
    const { roles, chrome } = parseTextCv('\n\n   \n');
    expect(roles).toEqual([]);
    expect(chrome.firstName).toBe('');
  });
});

describe('missing sections', () => {
  // Wrapped at a page edge the way PDF text extraction leaves it.
  const source = [
    'Ada Lovelace',
    'Experience',
    '2020–2024 Engineer, Acme, Berlin',
    '- Shipped the billing system.',
    'Projects',
    'Engine A self-hostable tool on Cloudflare Workers: Hono API, D1 with Drizzle, Astro frontend, and',
    'a browser extension with extraction across several providers.',
    'Notes An open source server tracking brand visibility across AI search engines (Perplexity, AI',
    'Overviews).',
    'Skills',
    'Backend TypeScript, Node.js',
    'Frontend React, Astro',
    'Research',
    "Master's Thesis Detecting hallucinations.",
  ].join('\n');

  const reading = (headings: string[]): ImportedCv => ({
    chrome: {
      ...EMPTY_CHROME,
      sections: headings.map((heading) => ({ heading, items: [{ left: 'x', right: 'y' }] })),
    },
    roles: [],
    unplaced: [],
  });

  it('names a section the text has and a reading left out', () => {
    expect(missingSections(reading(['Skills', 'Research']), source)).toEqual(['Projects']);
  });

  it('never calls Experience or Summary missing', () => {
    expect(missingSections(reading(['Projects', 'Skills', 'Research']), source)).toEqual([]);
  });

  it('fills a missing section from the rules, with wrapped lines joined back', () => {
    const filled = withSections(reading(['Skills', 'Research']), parseTextCv(source), ['Projects']);
    const projects = filled.chrome.sections.find((s) => s.heading === 'Projects');
    expect(projects?.items.map((i) => `${i.left} ${i.right}`.trim())).toEqual([
      'Engine A self-hostable tool on Cloudflare Workers: Hono API, D1 with Drizzle, Astro frontend, and a browser extension with extraction across several providers.',
      'Notes An open source server tracking brand visibility across AI search engines (Perplexity, AI Overviews).',
    ]);
  });

  it('keeps short skill rows apart', () => {
    const skills = parseTextCv(source).chrome.sections.find((s) => s.heading === 'Skills');
    expect(skills?.items).toHaveLength(2);
  });
});

describe('bullets from a moderncv PDF', () => {
  // Text layer of a moderncv PDF: `{` is the itemize glyph, lines wrap at the
  // page edge. Each wrap used to become its own fact, glyph included.
  const source = [
    'Ada Lovelace',
    'Experience',
    '2025–current Full-Stack Developer, Acme, Berlin',
    '{ Built an MCP server bridging Claude and the CMS: versioned eval-backed prompts, embedded keyword',
    'research, auto-generated backlinks and schema on publish.',
    '{ Proposed and led test automation: UI coverage across 8 applications and 180+ pages, cutting a',
    '3-minute automated run.',
    '{ Built tracemate, an internal CLI triage tool.',
  ].join('\n');

  it('drops the glyph and joins a bullet the page wrapped', () => {
    expect(parseTextCv(source).roles[0]?.bullets).toEqual([
      'Built an MCP server bridging Claude and the CMS: versioned eval-backed prompts, embedded keyword research, auto-generated backlinks and schema on publish.',
      'Proposed and led test automation: UI coverage across 8 applications and 180+ pages, cutting a 3-minute automated run.',
      'Built tracemate, an internal CLI triage tool.',
    ]);
  });

  it('does not merge unmarked bullets that simply lack a full stop', () => {
    const plainCv = [
      'Experience',
      '2020–2024 Engineer, Acme, Berlin',
      'Automated routine maintenance with CRON jobs across every payroll system we ran, reducing monitoring',
      'Built dashboards and admin tools for enterprise clients across three regions and teams',
    ].join('\n');
    expect(parseTextCv(plainCv).roles[0]?.bullets).toHaveLength(2);
  });
});
