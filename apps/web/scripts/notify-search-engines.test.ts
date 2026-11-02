import { describe, expect, it } from 'vitest';
import { changedUrls, locs, pageUrl } from './notify-search-engines.mjs';

const site = 'https://jlog.ai';

describe('pageUrl', () => {
  it.each([
    ['apps/web/src/pages/index.astro', 'https://jlog.ai/'],
    ['apps/web/src/pages/job-tracker-comparison.md', 'https://jlog.ai/job-tracker-comparison/'],
    ['apps/web/src/pages/docs/index.astro', 'https://jlog.ai/docs/'],
    ['apps/web/src/pages/docs/self-hosting/deploy.md', 'https://jlog.ai/docs/self-hosting/deploy/'],
  ])('%s builds to %s', (file, url) => {
    expect(pageUrl(file, site)).toBe(url);
  });

  it.each([
    'apps/web/src/pages/robots.txt.ts',
    'apps/web/src/pages/[indexnow].txt.ts',
    'apps/web/src/layouts/AnswerLayout.astro',
    'apps/api/src/index.ts',
  ])('%s is not a page', (file) => {
    expect(pageUrl(file, site)).toBeUndefined();
  });
});

describe('locs', () => {
  it('reads every loc', () => {
    const xml =
      '<urlset><url><loc>https://jlog.ai/</loc></url><url><loc> https://jlog.ai/docs/ </loc></url></urlset>';
    expect(locs(xml)).toEqual(['https://jlog.ai/', 'https://jlog.ai/docs/']);
  });
});

describe('changedUrls', () => {
  const sitemap = ['https://jlog.ai/', 'https://jlog.ai/job-tracker-comparison/'];

  it('keeps changed pages the sitemap lists, once each', () => {
    const files = [
      'apps/web/src/pages/job-tracker-comparison.md',
      'apps/web/src/pages/job-tracker-comparison.md',
      'apps/web/src/pages/dashboard.astro',
      'apps/web/src/pages/404.astro',
      'README.md',
    ].join('\n');
    expect(changedUrls(files, sitemap, site)).toEqual(['https://jlog.ai/job-tracker-comparison/']);
  });

  it('sends the whole sitemap for ALL', () => {
    expect(changedUrls('ALL\n', sitemap, site)).toEqual(sitemap);
  });
});
