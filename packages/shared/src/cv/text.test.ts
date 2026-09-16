import { describe, expect, it } from 'vitest';
import { parseTextCv } from './text';

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
