#!/usr/bin/env node
/**
 * Growth experiment E02: turn open-aeo's JSON into the numbers the growth notes
 * track, as markdown for the workflow's job summary.
 *
 *   node growth/aeo-summary.mjs <check.json> <branded.json> <sources.json>
 *
 * The headline is the non-branded citation rate: the share of question and
 * engine pairs where jlog.ai was cited in at least one sample. Branded
 * questions are shown apart and never counted in it.
 */
import { readFileSync } from 'node:fs';

const [checkPath, brandedPath, sourcesPath] = process.argv.slice(2);
if (!checkPath || !brandedPath || !sourcesPath) {
  console.error('usage: aeo-summary.mjs <check.json> <branded.json> <sources.json>');
  process.exit(2);
}

const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const check = read(checkPath);
const branded = read(brandedPath);
const sources = read(sourcesPath);

const pct = (n, d) => (d === 0 ? 'n/a' : `${Math.round((100 * n) / d)}%`);
const cell = (text) => String(text).replaceAll('|', '\\|');

function rateLine(checks, engine) {
  const rows = engine ? checks.filter((c) => c.engine === engine) : checks;
  const cited = rows.filter((c) => c.cited).length;
  return `${cited} of ${rows.length} (${pct(cited, rows.length)})`;
}

const engines = [...new Set(check.checks.map((c) => c.engine))].sort();
const date = new Date().toISOString().slice(0, 10);

const out = [];
out.push(`## AEO baseline for ${check.targetDomain}, ${date}`);
out.push('');
out.push(
  '**Non-branded citation rate** (question and engine pairs where jlog.ai was cited in at least one sample):',
);
out.push('');
out.push(`- All engines: ${rateLine(check.checks)}`);
for (const engine of engines) out.push(`- ${engine}: ${rateLine(check.checks, engine)}`);
out.push('');
out.push('| Question | Engine | Cited | Samples cited | Trend |');
out.push('|---|---|---|---|---|');
for (const c of check.checks) {
  out.push(
    `| ${cell(c.query)} | ${c.engine} | ${c.cited ? 'yes' : 'no'} | ${c.citedCount} of ${c.sampleCount} | ${c.trend} |`,
  );
}
out.push('');
out.push('**Branded** (kept out of the rate above):');
out.push('');
for (const c of branded.checks) {
  out.push(`- ${c.query} · ${c.engine}: ${c.citedCount} of ${c.sampleCount} samples cite jlog.ai`);
}
out.push('');
out.push(`**Who gets cited instead** (all stored runs, ${sources.checksAnalysed} checks):`);
out.push('');
out.push('| Domain | Appearances | Questions |');
out.push('|---|---|---|');
for (const d of sources.domains.slice(0, 25)) {
  out.push(`| ${d.domain} | ${d.appearances} | ${d.queries.length} |`);
}

console.log(out.join('\n'));
