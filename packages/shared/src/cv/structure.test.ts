import { describe, expect, it } from 'vitest';
import { cvStructureSchema, toImportedCv } from './structure';

const SOURCE = `Ada Lovelace
ada@example.com

EXPERIENCE

Staff Engineer, Acme  2017 - 2021
- Cut p99 latency by 40% across the checkout path.
- Owned billing end to end.`;

const MODEL_OUTPUT = {
  chrome: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' },
  roles: [
    {
      employer: 'Acme',
      roleTitle: 'Staff Engineer',
      dates: '2017--2021',
      bullets: ['Cut p99 latency by 40% across the checkout path.', 'Owned billing end to end.'],
    },
  ],
};

describe('toImportedCv', () => {
  it('keeps bullets the CV actually contains', () => {
    const cv = toImportedCv(cvStructureSchema.parse(MODEL_OUTPUT), SOURCE);
    expect(cv.roles[0]?.bullets).toEqual([
      'Cut p99 latency by 40% across the checkout path.',
      'Owned billing end to end.',
    ]);
    expect(cv.unplaced).toEqual([]);
  });

  // The whole point of the gate: a model that improves the wording is writing,
  // and written bullets must never reach a table of things you said.
  it('drops a bullet the model reworded', () => {
    const reworded = {
      ...MODEL_OUTPUT,
      roles: [
        {
          ...MODEL_OUTPUT.roles[0],
          bullets: ['Slashed p99 latency by 40%, transforming checkout.'],
        },
      ],
    };
    const cv = toImportedCv(cvStructureSchema.parse(reworded), SOURCE);
    expect(cv.roles[0]?.bullets ?? []).toEqual([]);
    expect(cv.unplaced).toEqual(['Slashed p99 latency by 40%, transforming checkout.']);
  });

  // A PDF breaks lines wherever the layout did; that is not a rewrite.
  it('accepts a bullet whose whitespace and case differ', () => {
    const rewrapped = {
      ...MODEL_OUTPUT,
      roles: [
        {
          ...MODEL_OUTPUT.roles[0],
          bullets: ['cut  p99   latency by 40% across the\ncheckout path.'],
        },
      ],
    };
    const cv = toImportedCv(cvStructureSchema.parse(rewrapped), SOURCE);
    expect(cv.roles[0]?.bullets).toHaveLength(1);
  });

  it('survives a model that omits half the fields', () => {
    const sparse = cvStructureSchema.parse({ roles: [{ employer: 'Acme' }] });
    const cv = toImportedCv(sparse, SOURCE);
    expect(cv.roles).toEqual([
      { employer: 'Acme', roleTitle: '', dates: '', location: '', bullets: [] },
    ]);
    expect(cv.chrome.firstName).toBe('');
  });

  it('rejects output that is not the agreed shape', () => {
    expect(cvStructureSchema.safeParse({ roles: 'lots' }).success).toBe(false);
    expect(cvStructureSchema.safeParse('not json at all').success).toBe(false);
  });

  it('drops a section the model returned empty', () => {
    const noisy = cvStructureSchema.parse({
      chrome: {
        sections: [
          { heading: 'Skills', items: [] },
          { heading: '', items: [{ right: 'x' }] },
        ],
      },
      roles: [],
    });
    expect(toImportedCv(noisy, SOURCE).chrome.sections).toEqual([]);
  });
});
