import { describe, expect, it } from 'vitest';
import { createLastmod, frontmatterDate, sourceCandidates } from './lastmod.mjs';

describe('sourceCandidates', () => {
  it('maps the root to index', () => {
    expect(sourceCandidates('https://jlog.ai/')).toEqual(['index.astro', 'index.md', 'index.mdx']);
  });

  it('tries the file, then the folder index', () => {
    expect(sourceCandidates('https://jlog.ai/docs/self-hosting/')).toEqual([
      'docs/self-hosting.astro',
      'docs/self-hosting.md',
      'docs/self-hosting.mdx',
      'docs/self-hosting/index.astro',
      'docs/self-hosting/index.md',
      'docs/self-hosting/index.mdx',
    ]);
  });
});

describe('frontmatterDate', () => {
  it('reads updated from frontmatter', () => {
    expect(frontmatterDate('---\ntitle: x\nupdated: 2026-10-30\n---\nbody')).toBe('2026-10-30');
  });

  it('ignores an updated line in the body', () => {
    expect(frontmatterDate('---\ntitle: x\n---\nupdated: 2026-10-30')).toBeUndefined();
  });

  it('ignores a date that is not one', () => {
    expect(frontmatterDate('---\nupdated: 2026-13-45\n---\n')).toBeUndefined();
  });
});

type Git = (args: string[], cwd: string) => string;

function fakeGit({ shallow, unshallows = false }: { shallow: boolean; unshallows?: boolean }) {
  const calls: string[][] = [];
  let isShallow = shallow;
  const git: Git = (args) => {
    calls.push(args);
    if (args[0] === 'rev-parse') return isShallow ? 'true\n' : 'false\n';
    if (args[0] === 'fetch') {
      if (!unshallows) throw new Error('offline');
      isShallow = false;
      return '';
    }
    if (args[0] === 'log') return '2026-09-01T10:00:00+02:00\n';
    return '';
  };
  return { git, calls };
}

const files: Record<string, string> = {
  '/p/index.astro': '',
  '/p/features/tracking.astro': '',
  '/p/job-tracker-comparison.md': '---\nupdated: 2026-10-30\n---\n',
  '/p/docs/capture.md': '---\ntitle: Capture\n---\n',
};
const fs = {
  exists: (file: string) => file in files,
  read: (file: string) => files[file] ?? '',
};

describe('createLastmod', () => {
  it('prefers the date a page states over git', () => {
    const { git } = fakeGit({ shallow: false });
    const lastmod = createLastmod({ pagesDir: '/p', ...fs, git, env: {} });
    expect(lastmod('https://jlog.ai/job-tracker-comparison/')).toBe('2026-10-30');
  });

  it('falls back to the last commit for the source file', () => {
    const { git, calls } = fakeGit({ shallow: false });
    const lastmod = createLastmod({ pagesDir: '/p', ...fs, git, env: {} });
    expect(lastmod('https://jlog.ai/docs/capture/')).toBe('2026-09-01T10:00:00+02:00');
    expect(calls.at(-1)).toEqual(['log', '-1', '--format=%cI', '--', 'docs/capture.md']);
  });

  it('gives no git date from a shallow clone outside Pages', () => {
    const { git, calls } = fakeGit({ shallow: true });
    const lastmod = createLastmod({ pagesDir: '/p', ...fs, git, env: {} });
    expect(lastmod('https://jlog.ai/features/tracking/')).toBeUndefined();
    expect(calls.some((args) => args[0] === 'fetch')).toBe(false);
    // A stated date needs no history.
    expect(lastmod('https://jlog.ai/job-tracker-comparison/')).toBe('2026-10-30');
  });

  it('fetches the history on Cloudflare Pages', () => {
    const { git } = fakeGit({ shallow: true, unshallows: true });
    const lastmod = createLastmod({ pagesDir: '/p', ...fs, git, env: { CF_PAGES: '1' } });
    expect(lastmod('https://jlog.ai/')).toBe('2026-09-01T10:00:00+02:00');
  });

  it('gives no git date when that fetch fails', () => {
    const { git } = fakeGit({ shallow: true, unshallows: false });
    const lastmod = createLastmod({ pagesDir: '/p', ...fs, git, env: { CF_PAGES: '1' } });
    expect(lastmod('https://jlog.ai/')).toBeUndefined();
  });

  it('gives nothing for a URL with no source file', () => {
    const { git } = fakeGit({ shallow: false });
    const lastmod = createLastmod({ pagesDir: '/p', ...fs, git, env: {} });
    expect(lastmod('https://jlog.ai/nowhere/')).toBeUndefined();
  });
});
