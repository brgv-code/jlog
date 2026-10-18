import { describe, expect, it } from 'vitest';
import { type StoredRole, archivedCount, sortRoles } from './facts';

const role = (over: Partial<StoredRole>): StoredRole => ({
  id: 'r',
  employer: 'Acme',
  roleTitle: 'Engineer',
  dates: '2020--2022',
  location: null,
  status: 'active',
  origin: 'cv',
  unconfirmed: 0,
  bullets: [],
  ...over,
});

describe('sortRoles', () => {
  it('puts the current role first, then by the year each ended', () => {
    const sorted = sortRoles([
      role({ id: 'old', dates: '2017--2022' }),
      role({ id: 'now', dates: '2025--current' }),
      role({ id: 'mid', dates: '2023--2025' }),
      role({ id: 'undated', dates: null }),
    ]);
    expect(sorted.map((r) => r.id)).toEqual(['now', 'mid', 'old', 'undated']);
  });
});

describe('archivedCount', () => {
  it('counts archived roles and archived bullets', () => {
    expect(
      archivedCount({
        roles: [
          role({ status: 'archived' }),
          role({
            bullets: [
              { id: 'a', text: 'x', status: 'archived', origin: 'history' },
              { id: 'b', text: 'y', status: 'active', origin: 'cv' },
            ],
          }),
        ],
        orphans: [],
      }),
    ).toBe(2);
  });
});
