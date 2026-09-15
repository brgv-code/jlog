#!/usr/bin/env node
/**
 * Mine a corpus of tailored LaTeX CVs into candidate profile facts.
 *
 *   node packages/db/scripts/mine-cv-corpus.mjs <corpus-dir> [--out report.json]
 *
 * Why this exists: a base CV is a condensed snapshot, not the full fact pool.
 * In the corpus this was written against, the base CV held 12 bullets while 67
 * tailored versions held 478 distinct ones. Seeding facts from the base alone
 * starves the tailoring agent, so facts are mined from everything ever sent.
 *
 * Deliberately writes NOTHING to the database. It emits a report for a human to
 * review, because these rows become the source of truth for generated documents
 * and a bad cluster would silently put someone else's phrasing of your work in
 * front of a hiring manager.
 *
 * Deliberately dependency-free (plain Node, no build step) so it runs whether or
 * not the workspace installs cleanly.
 *
 * Clustering is deterministic: normalise, then greedy Jaccard over content words
 * within a single employer. That resolves verbatim reuse, which is the bulk of a
 * real corpus, and leaves genuinely-reworded pairs for an optional LLM pass.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative } from 'node:path';

// Tunable with --threshold. 0.45 merges genuine rewordings of one achievement
// without collapsing distinct ones; the report is reviewed by a human either way,
// so a visible over-merge is cheaper than a silent split.
const DEFAULT_THRESHOLD = 0.45;
const MIN_BULLET_LEN = 30;
const MAX_BULLET_LEN = 600;

const STOPWORDS = new Set(
  `a an and are as at be by for from in into of on or the to with using via across over
   built build building shipped ship led lead owned own that this it its their our`.split(/\s+/),
);

// Employers are the partition key for clustering, so a job written two ways in
// two CVs becomes two disjoint fact pools that no merge candidate can ever
// reconcile. Supply `--aliases` to fold them together before anything clusters.
let ALIASES = new Map();

const aliasKey = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();
const aliasEmployer = (name) => ALIASES.get(aliasKey(name)) ?? name;

// --- LaTeX reading -------------------------------------------------------

/** Read the balanced `{...}` group starting at `i`. Returns [content, nextIndex]. */
function readGroup(src, from) {
  if (src[from] !== '{') return [null, from];
  let depth = 0;
  const start = from + 1;
  let cursor = from;
  while (cursor < src.length) {
    const ch = src[cursor];
    if (ch === '\\') {
      cursor += 2;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return [src.slice(start, cursor), cursor + 1];
    }
    cursor++;
  }
  return [null, cursor];
}

/** Skip any `[...]` optional arguments and surrounding whitespace. */
function skipOptional(src, from) {
  let cursor = from;
  for (;;) {
    while (cursor < src.length && /\s/.test(src[cursor])) cursor++;
    if (src[cursor] !== '[') return cursor;
    const close = src.indexOf(']', cursor);
    if (close === -1) return cursor;
    cursor = close + 1;
  }
}

/** Read `n` consecutive brace groups from `i`, tolerating optional args between them. */
function readGroups(src, from, n) {
  const out = [];
  let cursor = from;
  for (let k = 0; k < n; k++) {
    cursor = skipOptional(src, cursor);
    const [group, next] = readGroup(src, cursor);
    if (group === null) return [out, cursor];
    out.push(group);
    cursor = next;
  }
  return [out, cursor];
}

/** Strip LaTeX markup down to the prose a human would read. */
function toProse(latex) {
  return latex
    // Only an unescaped % opens a comment. `\%` is data, and stripping it turned
    // "reducing manual effort by 60\%" into "...by 60\".
    .replace(/(^|[^\\])%.*$/gm, '$1')
    .replace(/\\href\{[^}]*\}\{([^}]*)\}/g, '$1')
    .replace(/\\(emph|textbf|textit|texttt|underline)\{([^}]*)\}/g, '$2')
    // Unescape specials to the character they stand for, before the generic
    // command strip runs; deleting them dropped the % from every percentage.
    .replace(/\\([&%$#_])/g, '$1')
    .replace(/\\[a-zA-Z@]+\s*(\[[^\]]*\])?/g, ' ')
    .replace(/[{}]/g, ' ')
    .replace(/~/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Reduce a date range to years. One job is written "Jun 2017 -- Oct 2021",
 * "2017 -- 2021" and "2017--2021" across the corpus; those are one answer split
 * three ways, and `commonest` picks a winner by counting strings.
 */
function normaliseDates(raw) {
  if (!raw) return raw;
  const parts = raw.split(/\s*(?:--+|[\u2013\u2014]|\s-\s|\bto\b)\s*/).filter(Boolean);
  const side = (s) => {
    const year = s.match(/\b(?:19|20)\d{2}\b/);
    if (year) return year[0];
    const open = s.match(/current|present|ongoing|now/i);
    return open ? open[0].toLowerCase() : s.trim();
  };
  const ends = parts.map(side);
  if (ends.length < 2) return ends[0] ?? raw;
  const [from, to] = [ends[0], ends[ends.length - 1]];
  return from === to ? from : `${from}--${to}`;
}

// --- Parsing one CV ------------------------------------------------------

/** What role and company was this CV aimed at? Header comment, then \title, then folder. */
function readTarget(src, file, root) {
  const tailored = src.match(/^%\s*Tailored:\s*(.+)$/m);
  const title = src.match(/\\title\{([^}]*)\}/);
  const folder = basename(dirname(file));
  let company = folder === basename(root) ? null : folder;
  let roleTitle = title ? toProse(title[1]) : null;
  if (tailored) {
    const [co, ...rest] = tailored[1].split(/\s+[-–—]\s+/);
    if (co) company = co.trim();
    if (rest.length) roleTitle = rest.join(' - ').trim();
  }
  return { company, roleTitle };
}

function parseCv(file, root) {
  const src = readFileSync(file, 'utf8');
  const target = readTarget(src, file, root);
  const source = relative(root, file);
  const bullets = [];
  const roles = [];

  const entryRe = /\\cventry\b/g;
  let m = entryRe.exec(src);
  while (m !== null) {
    // Advance before any branch below can `continue`, or a skipped entry loops
    // forever on the same match.
    const at = m.index + m[0].length;
    m = entryRe.exec(src);
    const [groups] = readGroups(src, at, 6);
    if (groups.length < 6) continue;
    const [rawDates, roleTitle, employer, location, , body] = groups.map(toProse.bind(null));
    const employerName = aliasEmployer(employer || '(unknown)');
    const dates = normaliseDates(rawDates);
    roles.push({ employer: employerName, roleTitle, dates, location });

    // Bullets inside this entry belong to this employer. Read from the raw body
    // so \item boundaries survive; convert each to prose individually.
    const rawBody = groups[5];
    const itemRe = /\\item\b/g;
    const positions = [];
    let im = itemRe.exec(rawBody);
    while (im !== null) {
      positions.push(im.index);
      im = itemRe.exec(rawBody);
    }
    positions.forEach((pos, idx) => {
      const end = idx + 1 < positions.length ? positions[idx + 1] : rawBody.length;
      const text = toProse(rawBody.slice(pos + 5, end).replace(/\\end\{itemize\}[\s\S]*$/, ''));
      if (text.length >= MIN_BULLET_LEN && text.length <= MAX_BULLET_LEN) {
        bullets.push({ employer: employerName, roleTitle, dates, content: text, source, target });
      }
    });
  }

  const summaryMatch = src.match(/\\section\{Summary\}([\s\S]*?)(?=\\section\{|\\end\{document\})/);
  const summary = summaryMatch ? toProse(summaryMatch[1]) : null;

  return { source, target, roles, bullets, summary };
}

// --- Clustering ----------------------------------------------------------

const normalise = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();

function contentWords(s) {
  return new Set(
    normalise(s)
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

function jaccard(a, b) {
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  const union = a.size + b.size - shared;
  return union === 0 ? 0 : shared / union;
}

/** Greedy clustering within one employer. Exact normalised matches merge first. */
function cluster(bullets, threshold) {
  const clusters = [];
  const byExact = new Map();

  for (const b of bullets) {
    const key = `${b.employer}::${normalise(b.content)}`;
    const hit = byExact.get(key);
    if (hit) {
      hit.variants.push(b);
      continue;
    }

    const words = contentWords(b.content);
    let best = null;
    let bestScore = 0;
    for (const c of clusters) {
      if (c.employer !== b.employer) continue;
      // Score against the closest member, not against the union of the
      // cluster's words. A union grows as variants are absorbed, which shrinks
      // Jaccard and makes a cluster progressively harder to join - the opposite
      // of what clustering should do, and it silently splits one fact into
      // several near-identical ones.
      let score = 0;
      for (const memberWords of c.memberWords) {
        const s = jaccard(words, memberWords);
        if (s > score) score = s;
      }
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }

    if (best && bestScore >= threshold) {
      best.variants.push(b);
      best.memberWords.push(words);
      byExact.set(key, best);
    } else {
      const created = {
        employer: b.employer,
        roleTitle: b.roleTitle,
        dates: b.dates,
        memberWords: [words],
        variants: [b],
      };
      clusters.push(created);
      byExact.set(key, created);
    }
  }

  // Canonical phrasing: the wording used most often, longest breaking ties.
  for (const c of clusters) {
    const counts = new Map();
    for (const v of c.variants) {
      const k = normalise(v.content);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    let bestKey = null;
    let bestCount = -1;
    for (const [k, n] of counts) {
      if (n > bestCount || (n === bestCount && k.length > (bestKey?.length ?? 0))) {
        bestKey = k;
        bestCount = n;
      }
    }
    c.canonical = c.variants.find((v) => normalise(v.content) === bestKey).content;
    c.uses = c.variants.length;
    c.distinctPhrasings = counts.size;
  }
  return clusters.sort((a, b) => b.uses - a.uses);
}

/**
 * Cluster pairs that look related but fell below the merge threshold.
 *
 * Word overlap resolves verbatim reuse and stops there. One achievement
 * reworded across years ("built, solo, a Python startup-discovery engine" and
 * "solely developed a Python-based discovery tool") shares meaning, not
 * vocabulary, and no threshold separates those from genuinely different work
 * without doing damage in one direction or the other.
 *
 * Rather than guess, surface the near misses as a short review list. Merging is
 * a judgement call; the tool's job is to make that judgement cheap instead of
 * pretending to make it.
 */
function mergeCandidates(clusters, threshold, floor = 0.25) {
  const pairs = [];
  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      const a = clusters[i];
      const b = clusters[j];
      if (a.employer !== b.employer) continue;
      let score = 0;
      for (const wa of a.memberWords) {
        for (const wb of b.memberWords) {
          const s = jaccard(wa, wb);
          if (s > score) score = s;
        }
      }
      if (score >= floor && score < threshold) {
        pairs.push({
          score: Number(score.toFixed(2)),
          employer: a.employer,
          idA: a.id,
          idB: b.id,
          a: a.canonical,
          b: b.canonical,
        });
      }
    }
  }
  return pairs.sort((x, y) => y.score - x.score);
}

/**
 * Deterministic id for a fact, so re-running the miner and re-importing upserts
 * the same rows instead of duplicating them.
 *
 * Keyed on employer plus the canonical phrasing. Merging two clusters changes
 * the canonical text and therefore the id, which is the known limit of this
 * scheme: after a merge the superseded row has to be removed rather than being
 * updated in place. Acceptable for a seeding import that runs a handful of
 * times; it would not be acceptable for a live sync.
 */
function factId(employer, canonical) {
  const key = `${employer}|${normalise(canonical)}`;
  return `pf_${createHash('sha1').update(key).digest('hex').slice(0, 24)}`;
}

function variantHash(content) {
  return createHash('sha1').update(normalise(content)).digest('hex').slice(0, 32);
}

/** A review sheet: what was found, and the calls a human still has to make. */
function toMarkdown(clusters, candidates, meta) {
  const lines = [];
  lines.push('# CV corpus review');
  lines.push('');
  lines.push(
    `Generated from \`${meta.corpusDir}\` — ${meta.cvCount} CVs, ${meta.bulletCount} bullets, ${clusters.length} candidate facts.`,
  );
  lines.push('');
  lines.push('Two jobs here. Both are judgement calls the miner deliberately does not make.');
  lines.push('');
  lines.push('1. **Merge review** — pairs that look like one achievement but did not cluster.');
  lines.push('   Tick the ones that are the same fact; each ticked line becomes a merge.');
  lines.push('2. **Fact review** — read the canonical phrasings. Anything wrong, stale or');
  lines.push('   overstated gets fixed or struck here, before it can reach a document.');
  lines.push('');
  lines.push('## 1. Merge candidates');
  lines.push('');
  lines.push('Ranked by similarity. Format: `- [ ] <keep-id> <- <merge-id>`.');
  lines.push('');
  for (const c of candidates) {
    lines.push(`- [ ] \`${c.idA}\` <- \`${c.idB}\`  *(~${c.score}, ${c.employer})*`);
    lines.push(`  - A: ${c.a}`);
    lines.push(`  - B: ${c.b}`);
  }
  lines.push('');
  lines.push('## 2. Candidate facts');
  lines.push('');
  const byEmployer = new Map();
  for (const c of clusters) {
    if (!byEmployer.has(c.employer)) byEmployer.set(c.employer, []);
    byEmployer.get(c.employer).push(c);
  }
  for (const [employer, list] of byEmployer) {
    lines.push(`### ${employer}`);
    lines.push('');
    for (const c of list) {
      lines.push(`- \`${c.id}\` **${c.uses}x used**, ${c.distinctPhrasings} phrasing(s)`);
      lines.push(`  - ${c.canonical}`);
      if (c.distinctPhrasings > 1) {
        const others = [...new Set(c.variants.map((v) => v.content))].filter(
          (t) => t !== c.canonical,
        );
        for (const o of others.slice(0, 4)) lines.push(`  - *alt:* ${o}`);
        if (others.length > 4) lines.push(`  - *(+${others.length - 4} more phrasings)*`);
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

// --- Main ----------------------------------------------------------------

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (extname(p) === '.tex' && /cv|resume/i.test(basename(p))) out.push(p);
  }
  return out;
}

const [, , corpusDir, ...rest] = process.argv;
if (!corpusDir) {
  console.error(
    'usage: mine-cv-corpus.mjs <corpus-dir> [--out report.json] [--threshold 0.45] [--aliases employers.json] [--extra file.tex ...]',
  );
  process.exit(64);
}
const outIdx = rest.indexOf('--out');
const outPath = outIdx === -1 ? null : rest[outIdx + 1];
const extraIdx = rest.indexOf('--extra');
const extras = extraIdx === -1 ? [] : rest.slice(extraIdx + 1).filter((a) => !a.startsWith('--'));

const aliasIdx = rest.indexOf('--aliases');
if (aliasIdx !== -1 && rest[aliasIdx + 1]) {
  const raw = JSON.parse(readFileSync(rest[aliasIdx + 1], 'utf8'));
  ALIASES = new Map(Object.entries(raw).map(([from, to]) => [aliasKey(from), to]));
}

const files = [...walk(corpusDir), ...extras];
const parsed = files.map((f) => parseCv(f, corpusDir));
const allBullets = parsed.flatMap((p) => p.bullets);
const thrIdx = rest.indexOf('--threshold');
const threshold = thrIdx === -1 ? DEFAULT_THRESHOLD : Number(rest[thrIdx + 1]);
const clusters = cluster(allBullets, threshold);
for (const c of clusters) c.id = factId(c.employer, c.canonical);

const employers = new Map();
for (const c of clusters) {
  employers.set(c.employer, (employers.get(c.employer) ?? 0) + 1);
}

// An alias that matches nothing is a typo that silently does nothing, which is
// exactly the failure this whole pass exists to remove.
if (ALIASES.size) {
  const canonical = new Set(ALIASES.values());
  const unused = [...canonical].filter((name) => !employers.has(name));
  console.log(`aliases applied:       ${ALIASES.size} -> ${canonical.size} canonical`);
  if (unused.length) {
    console.error(`alias targets that matched no employer: ${unused.join(', ')}`);
    process.exit(65);
  }
}

console.log(`threshold:             ${threshold}`);
console.log(`CVs parsed:            ${files.length}`);
console.log(`bullets extracted:     ${allBullets.length}`);
console.log(`candidate facts:       ${clusters.length}`);
console.log(`employers:             ${employers.size}`);
console.log(`clusters with >1 phrasing: ${clusters.filter((c) => c.distinctPhrasings > 1).length}`);
const candidates = mergeCandidates(clusters, threshold);
console.log(`pairs to review for merging:  ${candidates.length}`);
console.log();
console.log('Top candidate facts by reuse:');
for (const c of clusters.slice(0, 12)) {
  console.log(
    `  [${String(c.uses).padStart(2)}x used, ${c.distinctPhrasings} phrasing(s)] ${c.employer}`,
  );
  console.log(`      ${c.canonical.slice(0, 130)}`);
}

if (candidates.length) {
  console.log('\nClosest pairs that did NOT merge (review these first):');
  for (const c of candidates.slice(0, 8)) {
    console.log(`  ~${c.score}  ${c.employer}`);
    console.log(`     A: ${c.a.slice(0, 96)}`);
    console.log(`     B: ${c.b.slice(0, 96)}`);
  }
}

if (outPath) {
  const report = {
    generatedFrom: corpusDir,
    cvCount: files.length,
    facts: clusters.map((c) => ({
      id: c.id,
      kind: 'bullet',
      employer: c.employer,
      roleTitle: c.roleTitle,
      dates: c.dates,
      canonical: c.canonical,
      uses: c.uses,
      variants: c.variants.map((v) => ({
        content: v.content,
        contentHash: variantHash(v.content),
        source: v.source,
        sourceCompany: v.target.company,
        sourceRoleTitle: v.target.roleTitle,
      })),
    })),
    mergeCandidates: candidates,
    summaries: parsed
      .filter((p) => p.summary)
      .map((p) => ({
        content: p.summary,
        source: p.source,
        sourceCompany: p.target.company,
        sourceRoleTitle: p.target.roleTitle,
      })),
  };
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nreport written: ${outPath}`);
  const mdIdx = rest.indexOf('--markdown');
  if (mdIdx !== -1 && rest[mdIdx + 1]) {
    writeFileSync(
      rest[mdIdx + 1],
      toMarkdown(clusters, candidates, {
        corpusDir,
        cvCount: files.length,
        bulletCount: allBullets.length,
      }),
    );
    console.log(`review sheet written: ${rest[mdIdx + 1]}`);
  }
}
