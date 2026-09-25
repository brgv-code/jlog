import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR, appliedNames, pendingPlan, prefixProblems } from './migrations.mjs';

describe('prefixProblems', () => {
  it('passes the migrations in the repo', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    expect(prefixProblems(files)).toEqual([]);
  });

  it('catches two branches picking the same number', () => {
    expect(prefixProblems(['0016_a.sql', '0016_b.sql'])).toEqual([
      '0016_a.sql and 0016_b.sql share the prefix 0016',
    ]);
  });

  it('catches a file that is not NNNN_name.sql', () => {
    expect(prefixProblems(['16_short.sql'])).toEqual(['16_short.sql does not match NNNN_name.sql']);
  });
});

describe('appliedNames', () => {
  it('reads wrangler d1 execute --json output', () => {
    const json = [
      { results: [{ name: '0000_initial.sql' }, { name: '0001_x.sql' }], success: true },
    ];
    expect(appliedNames(json)).toEqual(['0000_initial.sql', '0001_x.sql']);
  });
});

describe('pendingPlan', () => {
  const files = [
    '0012_billing.sql',
    '0013_designs.sql',
    '0014_meta.sql',
    '0015_auth.sql',
    '0016_values.sql',
    '0017_new.sql',
  ];

  it('applies only what is newer than the newest recorded migration', () => {
    const applied = files.slice(0, 5);
    expect(pendingPlan(files, applied)).toEqual({
      pending: ['0017_new.sql'],
      newest: '0016_values.sql',
      behind: [],
    });
  });

  it('refuses a gap: a missing ledger row would re-run that migration', () => {
    const applied = ['0012_billing.sql', '0014_meta.sql', '0015_auth.sql'];
    const plan = pendingPlan(files, applied);
    expect(plan.behind).toEqual(['0013_designs.sql']);
    expect(plan.pending).toEqual(['0013_designs.sql', '0016_values.sql', '0017_new.sql']);
  });

  it('treats an empty ledger as a fresh database, not a gap', () => {
    expect(pendingPlan(files, []).behind).toEqual([]);
  });
});
