#!/usr/bin/env node
/**
 * Migration checks for CI and for the deploy (BRG-220).
 *
 *   node packages/db/scripts/migrations.mjs prefixes
 *     Fails on two files sharing a numeric prefix, or a file that does not
 *     match NNNN_name.sql. Two branches open at once both pick the next free
 *     number; this is where that is caught, not on a fresh database.
 *
 *   node packages/db/scripts/migrations.mjs pending <applied.json>
 *     <applied.json> is `wrangler d1 execute --json` output of
 *     `SELECT name FROM d1_migrations`. Prints what `migrations apply` would
 *     run, and fails if any of it is OLDER than the newest recorded migration.
 *
 * Why the second check exists: `wrangler d1 migrations apply` runs every file
 * the ledger does not list. When the ledger has a gap (a migration applied by
 * hand, as 0013 and 0016 were), wrangler re-runs it. Most migrations here are
 * safe to repeat; 0015 rebuilds `users` and is not. A pending migration that
 * sorts below the newest applied one can only mean the ledger and the database
 * disagree, and a person has to look before anything runs.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

const NAME = /^(\d{4})_[a-z0-9_]+\.sql$/;

export function prefixProblems(files) {
  const problems = [];
  const seen = new Map();
  for (const file of files) {
    const match = NAME.exec(file);
    if (!match) {
      problems.push(`${file} does not match NNNN_name.sql`);
      continue;
    }
    const prefix = match[1];
    const other = seen.get(prefix);
    if (other) problems.push(`${other} and ${file} share the prefix ${prefix}`);
    else seen.set(prefix, file);
  }
  return problems;
}

/** Names from `wrangler d1 execute --json`, which wraps rows as [{ results: [...] }]. */
export function appliedNames(json) {
  const batches = Array.isArray(json) ? json : [json];
  return batches.flatMap((batch) => (batch?.results ?? []).map((row) => row.name)).filter(Boolean);
}

export function pendingPlan(files, applied) {
  const done = new Set(applied);
  const pending = files.filter((f) => !done.has(f)).sort();
  const newest = [...applied]
    .filter((name) => NAME.test(name))
    .sort()
    .at(-1);
  const behind = newest ? pending.filter((f) => f < newest) : [];
  return { pending, newest, behind };
}

function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

function main([command, arg]) {
  if (command === 'prefixes') {
    const problems = prefixProblems(migrationFiles());
    for (const p of problems) console.error(`::error::${p}`);
    if (problems.length) return 1;
    console.log('Migration prefixes are unique.');
    return 0;
  }

  if (command === 'pending' && arg) {
    const applied = appliedNames(JSON.parse(readFileSync(arg, 'utf8')));
    const { pending, newest, behind } = pendingPlan(migrationFiles(), applied);
    if (behind.length) {
      console.error(
        `::error::The ledger (d1_migrations) is missing ${behind.join(', ')}, older than the newest applied migration ${newest}. Applying would re-run them. Check whether each is already in the database, then record it in d1_migrations by hand before deploying.`,
      );
      return 1;
    }
    console.log(pending.length ? `Will apply: ${pending.join(', ')}` : 'No pending migrations.');
    return 0;
  }

  console.error('usage: migrations.mjs prefixes | pending <applied.json>');
  return 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(main(process.argv.slice(2)));
}
