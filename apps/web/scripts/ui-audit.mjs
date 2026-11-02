/**
 * Photograph the app and measure how closely it keeps to its own tokens.
 *
 * Built for the UI case study: every condition (the current pages, a bare
 * model, a model with skills, …) is captured with this one script, so the
 * comparison is between outputs and not between ways of measuring them.
 *
 * It measures the rendered page, not the source. The inner pages style mostly
 * through inline `style={{}}` objects, so a grep over class names sees perhaps
 * half of what ships; `getComputedStyle` sees all of it, the same way
 * `/designsystem` reads tokens off the live stylesheet. A source scan for
 * Tailwind arbitrary values (`text-[13px]`) is included as well, because that
 * is the escape hatch the case study is about.
 *
 * Needs the API and the web app running locally (a demo account is opened per
 * run, so nothing real is touched):
 *
 *   node apps/web/scripts/ui-audit.mjs --out <dir> [--base http://localhost:4321] [--web <apps/web>]
 *
 * Writes <dir>/screens/*.png, <dir>/metrics.json and <dir>/summary.md.
 */
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';

const HERE = dirname(fileURLToPath(import.meta.url));
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

const { values: args } = parseArgs({
  options: {
    base: { type: 'string', default: 'http://localhost:4321' },
    out: { type: 'string' },
    // The web app being audited, for the source scan and the commit. Defaults to
    // this checkout; pass a worktree's apps/web when auditing a case study branch.
    web: { type: 'string', default: join(HERE, '..') },
  },
});
const WEB = args.web;
if (!args.out) {
  console.error('usage: ui-audit.mjs --out <dir> [--base <url>] [--web <dir>]');
  process.exit(1);
}

/** Desktop and a phone. 390 is an iPhone 15, the narrowest width worth defending. */
const WIDTHS = [1440, 390];
const THEMES = ['light', 'dark'];

/**
 * `public` pages are captured signed out. `prepare` runs after load, for state
 * a URL cannot reach: the application detail is a selection, not a route.
 */
const PAGES = [
  { name: 'landing', path: '/', public: true },
  { name: 'dashboard', path: '/dashboard' },
  { name: 'applications', path: '/applications' },
  {
    name: 'application-detail',
    path: '/applications',
    // By name, not position: the demo story is seeded but dated relative to
    // now, so the first row changes from one day to the next.
    prepare: (page) =>
      page.locator('ul[aria-label="Applications"] li button', { hasText: 'Spotify' }).first().click(),
  },
  { name: 'cv', path: '/cv' },
  { name: 'settings', path: '/settings' },
];

// ---------------------------------------------------------------------------
// In the page
// ---------------------------------------------------------------------------

/**
 * Runs in the browser. Resolves every token to the value the browser would
 * compute for it, then tallies what the visible elements actually use.
 *
 * Tokens are resolved through a probe element rather than read as strings:
 * `--space-4` is declared as `1rem` but computes as `16px`, and a colour token
 * may be declared as `#b45309` and compute as `rgb(180, 83, 9)`.
 *
 * A value counts as a token if it matches any custom property in scope, not
 * only the app's `--text-*` and `--color-*`: the marketing pages carry their
 * own scale (`--t-*`, `--ink`, … under `.site`), and holding them to the app's
 * names would score a real system as no system.
 */
function measure() {
  const scope = document.querySelector('.site') ?? document.body;
  const scoped = getComputedStyle(scope);
  const names = [];
  for (const sheet of document.styleSheets) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of rules) {
      if (!rule.style) continue;
      for (const prop of rule.style) if (prop.startsWith('--')) names.push(prop);
    }
  }
  const declared = [...new Set(names)].filter((n) => scoped.getPropertyValue(n).trim());

  /*
   * Each role takes the properties named for it, so a 12px spacing token does
   * not excuse a 12px font. Colour is the exception: any property may hold
   * one, and those that are not colours fall back to a sentinel the parent
   * sets, which is then dropped (an invalid `var()` computes as unset, which
   * inherits).
   */
  const SENTINEL = { fontSize: '1.25px', color: 'rgb(1, 2, 3)' };
  const holder = document.createElement('div');
  Object.assign(holder.style, { position: 'absolute', visibility: 'hidden', ...SENTINEL });
  const probe = document.createElement('div');
  holder.appendChild(probe);
  scope.appendChild(holder);
  const resolve = (cssProp, sentinel, pattern = /./) => {
    const set = new Set();
    for (const n of declared.filter((d) => pattern.test(d))) {
      probe.style[cssProp] = `var(${n})`;
      const v = getComputedStyle(probe)[cssProp];
      if (v && v !== sentinel) set.add(v);
    }
    probe.style[cssProp] = '';
    return set;
  };
  const tokens = {
    fontSize: resolve('fontSize', SENTINEL.fontSize, /^--(text|t)-/),
    space: resolve('marginLeft', '0px', /^--(space|gutter)/),
    radius: resolve('borderTopLeftRadius', '0px', /^--radius/),
    color: resolve('color', SENTINEL.color),
  };
  holder.remove();

  const tally = () => new Map();
  const bump = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);
  const seen = {
    fontSize: tally(),
    fontWeight: tally(),
    textColor: tally(),
    background: tally(),
    radius: tally(),
    space: tally(),
    transition: tally(),
  };

  const isOpaque = (c) => c.startsWith('rgb(');
  const hasOwnText = (el) =>
    [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim());

  for (const el of document.body.querySelectorAll('*')) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;

    if (hasOwnText(el)) {
      bump(seen.fontSize, cs.fontSize);
      bump(seen.fontWeight, cs.fontWeight);
      bump(seen.textColor, cs.color);
    }
    if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)') bump(seen.background, cs.backgroundColor);
    if (cs.borderTopLeftRadius !== '0px') bump(seen.radius, cs.borderTopLeftRadius);
    for (const p of [
      'paddingTop',
      'paddingRight',
      'paddingBottom',
      'paddingLeft',
      'marginTop',
      'marginBottom',
      'rowGap',
      'columnGap',
    ]) {
      const v = cs[p];
      if (v && v !== '0px' && v !== 'normal' && v.endsWith('px')) bump(seen.space, v);
    }
    if (cs.transitionDuration && cs.transitionDuration !== '0s') {
      bump(seen.transition, `${cs.transitionDuration} ${cs.transitionTimingFunction}`);
    }
  }

  /*
   * A colour with alpha is almost always a deliberate wash (`Badge` mixes a
   * status ink at 10%), not a stray value, so only opaque colours are held to
   * the token list. The tinted ones are still reported, just not as misses.
   */
  const report = (map, allowed, { opaqueOnly = false } = {}) => {
    const values = [...map.entries()].sort((a, b) => b[1] - a[1]);
    const judged = opaqueOnly ? values.filter(([v]) => isOpaque(v)) : values;
    const off = allowed ? judged.filter(([v]) => !allowed.has(v)) : [];
    return {
      distinct: values.length,
      uses: values.reduce((s, [, n]) => s + n, 0),
      values: Object.fromEntries(values),
      ...(allowed && {
        offToken: Object.fromEntries(off),
        offTokenUses: off.reduce((s, [, n]) => s + n, 0),
      }),
    };
  };

  return {
    tokenCounts: Object.fromEntries(Object.entries(tokens).map(([k, v]) => [k, v.size])),
    fontSize: report(seen.fontSize, tokens.fontSize),
    fontWeight: report(seen.fontWeight),
    textColor: report(seen.textColor, tokens.color, { opaqueOnly: true }),
    background: report(seen.background, tokens.color, { opaqueOnly: true }),
    radius: report(seen.radius, tokens.radius),
    space: report(seen.space, tokens.space),
    transition: report(seen.transition),
  };
}

// ---------------------------------------------------------------------------
// Source scan
// ---------------------------------------------------------------------------

/** Every Tailwind arbitrary value in a component, grouped by utility. */
async function scanArbitraryValues() {
  const dir = join(WEB, 'src', 'components');
  const files = (await readdir(dir, { recursive: true })).filter((f) => f.endsWith('.tsx'));
  const byUtility = {};
  const byFile = {};
  for (const file of files) {
    const text = await readFile(join(dir, file), 'utf8');
    const hits = text.match(/\b[a-z]+(?:-[a-z]+)*-\[[^\]\s]+\]/g) ?? [];
    if (!hits.length) continue;
    byFile[file] = hits.length;
    for (const hit of hits) {
      const utility = hit.slice(0, hit.indexOf('-['));
      byUtility[utility] ??= {};
      byUtility[utility][hit] = (byUtility[utility][hit] ?? 0) + 1;
    }
  }
  return { files: byFile, utilities: byUtility };
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

function git(...argv) {
  return execFileSync('git', argv, { cwd: WEB, encoding: 'utf8' }).trim();
}

async function capture(browser, storageState, out) {
  const results = [];
  for (const width of WIDTHS) {
    for (const theme of THEMES) {
      for (const spec of PAGES) {
        const context = await browser.newContext({
          viewport: { width, height: 900 },
          deviceScaleFactor: 2,
          colorScheme: theme,
          ...(spec.public ? {} : { storageState }),
        });
        await context.addInitScript((t) => localStorage.setItem('jlog_theme', t), theme);
        const page = await context.newPage();
        await page.goto(args.base + spec.path, { waitUntil: 'networkidle' });
        if (spec.prepare) {
          await spec.prepare(page);
          await page.waitForLoadState('networkidle');
        }
        // Charts and lists fade in; let them land before measuring.
        await page.waitForTimeout(800);
        // `astro dev` injects its toolbar; it is not the product, so it is neither shot nor counted.
        await page.evaluate(() => document.querySelector('astro-dev-toolbar')?.remove());

        const file = `${spec.name}-${width}-${theme}.png`;
        await page.screenshot({
          path: join(out, 'screens', file),
          fullPage: true,
          animations: 'disabled',
        });

        const metrics = await page.evaluate(measure);
        await page.addScriptTag({ path: AXE });
        const axe = await page.evaluate(async () => {
          const r = await window.axe.run(document, { resultTypes: ['violations'] });
          return r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
        });

        results.push({ page: spec.name, width, theme, screenshot: `screens/${file}`, metrics, axe });
        console.log(`  ${file}`);
        await context.close();
      }
    }
  }
  return results;
}

function summarise(meta, results, source) {
  const row = (r) => {
    const m = r.metrics;
    const contrast = r.axe.find((v) => v.id === 'color-contrast')?.nodes ?? 0;
    return `| ${r.page} | ${m.fontSize.distinct} | ${m.fontSize.offTokenUses} | ${m.space.distinct} | ${m.space.offTokenUses} | ${m.radius.distinct} | ${m.textColor.offTokenUses + m.background.offTokenUses} | ${m.transition.distinct} | ${r.axe.length} | ${contrast} |`;
  };
  const table = (width, theme) =>
    [
      `### ${width}px, ${theme}`,
      '',
      '| Page | Font sizes | Off scale uses | Spacing values | Off scale uses | Radii | Untokenised colour uses | Transitions | axe rules failed | Contrast nodes |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      ...results.filter((r) => r.width === width && r.theme === theme).map(row),
      '',
    ].join('\n');

  const arbitrary = Object.entries(source.utilities)
    .map(([u, hits]) => `| ${u} | ${Object.keys(hits).length} | ${Object.values(hits).reduce((a, b) => a + b, 0)} |`)
    .join('\n');

  return [
    '# UI audit',
    '',
    `Captured ${meta.capturedAt} at \`${meta.commit.slice(0, 7)}\`${meta.webDirty ? ' (apps/web/src has uncommitted changes)' : ''}.`,
    '',
    'Counts are of visible elements in the rendered page. "Off scale" means a computed value that matches no token.',
    '',
    ...WIDTHS.flatMap((w) => THEMES.map((t) => table(w, t))),
    '## Tailwind arbitrary values in source',
    '',
    '| Utility | Distinct values | Uses |',
    '| --- | --- | --- |',
    arbitrary,
    '',
  ].join('\n');
}

const out = args.out;
await mkdir(join(out, 'screens'), { recursive: true });

const browser = await chromium.launch();
try {
  // One throwaway demo account per run, seeded the same way every time.
  const signIn = await browser.newContext();
  const page = await signIn.newPage();
  await page.goto(`${args.base}/demo`);
  await page.waitForURL('**/dashboard**', { timeout: 60_000 });
  const storageState = await signIn.storageState();
  await signIn.close();

  const meta = {
    capturedAt: new Date().toISOString(),
    base: args.base,
    commit: git('rev-parse', 'HEAD'),
    webDirty: git('status', '--porcelain', '--', 'src') !== '',
  };
  const results = await capture(browser, storageState, out);
  const source = await scanArbitraryValues();

  await writeFile(join(out, 'metrics.json'), JSON.stringify({ meta, results, source }, null, 2));
  await writeFile(join(out, 'summary.md'), summarise(meta, results, source));
  console.log(`wrote ${relative(process.cwd(), out) || out}`);
} finally {
  await browser.close();
}
