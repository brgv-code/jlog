import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/*
 * `<lastmod>` for each sitemap URL (astro.config.mjs).
 *
 * Google reads lastmod as "the last time this page changed in a way that
 * matters", and once a site's dates prove wrong it ignores them for good
 * (developers.google.com/search/blog/2023/06/sitemaps-lastmod-ping). So a date
 * here has to be true or absent, never a guess:
 *
 * 1. A page that states its own date (`updated:` in Markdown frontmatter, as
 *    the answer pages do) uses it, so the sitemap agrees with what the reader
 *    is shown.
 * 2. Otherwise the date of the last commit that touched the page's source file.
 * 3. Otherwise nothing. That includes a shallow clone, where every file's last
 *    commit is HEAD and every page would claim to have changed today.
 *
 * Cloudflare Pages builds from a shallow clone, so on Pages (CF_PAGES=1) the
 * history is fetched first. Anywhere else a shallow clone just means no dates;
 * CI typechecks this config and has no reason to fetch the whole history.
 */

const EXTENSIONS = ['.astro', '.md', '.mdx'];

/** Source files, relative to src/pages, that a page URL could be built from. */
export function sourceCandidates(page) {
  const path = decodeURIComponent(new URL(page, 'http://x').pathname).replace(/^\/+|\/+$/g, '');
  const bases = path ? [path, `${path}/index`] : ['index'];
  return bases.flatMap((base) => EXTENSIONS.map((ext) => `${base}${ext}`));
}

/** The `updated:` date in a Markdown file's frontmatter, if it has one. */
export function frontmatterDate(source) {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source)?.[1];
  const date =
    frontmatter && /^updated:\s*['"]?(\d{4}-\d{2}-\d{2})['"]?\s*$/m.exec(frontmatter)?.[1];
  return date && !Number.isNaN(Date.parse(date)) ? date : undefined;
}

function runGit(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

/** Full history is available, fetching it on Cloudflare Pages if need be. */
function hasHistory(cwd, git, env) {
  try {
    if (git(['rev-parse', '--is-shallow-repository'], cwd).trim() === 'false') return true;
    if (env.CF_PAGES !== '1') return false;
    git(['fetch', '--unshallow', '--quiet'], cwd);
    return git(['rev-parse', '--is-shallow-repository'], cwd).trim() === 'false';
  } catch {
    // No git, not a repository, or the fetch failed: no dates rather than wrong ones.
    return false;
  }
}

/**
 * Returns `(pageUrl) => lastmod | undefined`. The dependencies are parameters
 * so the tests can run without a repository.
 *
 * @param {{
 *   pagesDir: string,
 *   exists?: (file: string) => boolean,
 *   read?: (file: string) => string,
 *   git?: (args: string[], cwd: string) => string,
 *   env?: Record<string, string | undefined>,
 * }} options
 * @returns {(page: string) => string | undefined}
 */
export function createLastmod({
  pagesDir,
  exists = existsSync,
  read = (file) => readFileSync(file, 'utf8'),
  git = runGit,
  env = process.env,
}) {
  const history = hasHistory(pagesDir, git, env);
  return (page) => {
    const file = sourceCandidates(page).find((candidate) => exists(join(pagesDir, candidate)));
    if (!file) return undefined;
    if (file.endsWith('.md') || file.endsWith('.mdx')) {
      const stated = frontmatterDate(read(join(pagesDir, file)));
      if (stated) return stated;
    }
    if (!history) return undefined;
    try {
      return git(['log', '-1', '--format=%cI', '--', file], pagesDir).trim() || undefined;
    } catch {
      return undefined;
    }
  };
}
