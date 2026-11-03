import { describe, expect, it } from 'vitest';
import { changedUrls, locs, sitemapEntries } from './notify-search-engines.mjs';

describe('locs', () => {
  it('reads every loc, as in a sitemap index', () => {
    const xml =
      '<sitemapindex><sitemap><loc>https://jlog.ai/sitemap-0.xml</loc></sitemap><sitemap><loc> https://jlog.ai/sitemap-1.xml </loc></sitemap></sitemapindex>';
    expect(locs(xml)).toEqual(['https://jlog.ai/sitemap-0.xml', 'https://jlog.ai/sitemap-1.xml']);
  });
});

describe('sitemapEntries', () => {
  it('maps each url to its lastmod, or null without one', () => {
    const xml = `<urlset>
      <url><loc>https://jlog.ai/</loc><lastmod>2026-10-30T00:00:00.000Z</lastmod></url>
      <url><loc>https://jlog.ai/privacy/</loc></url>
    </urlset>`;
    expect(sitemapEntries(xml)).toEqual({
      'https://jlog.ai/': '2026-10-30T00:00:00.000Z',
      'https://jlog.ai/privacy/': null,
    });
  });
});

describe('changedUrls', () => {
  const previous = {
    'https://jlog.ai/': '2026-10-30',
    'https://jlog.ai/privacy/': null,
    'https://jlog.ai/terms/': '2026-09-27',
  };

  it('finds pages that are new or whose lastmod moved, and nothing else', () => {
    const current = {
      'https://jlog.ai/': '2026-11-03',
      'https://jlog.ai/privacy/': null,
      'https://jlog.ai/terms/': '2026-09-27',
      'https://jlog.ai/new-page/': null,
    };
    expect(changedUrls(current, previous)).toEqual([
      'https://jlog.ai/',
      'https://jlog.ai/new-page/',
    ]);
  });

  it('sends nothing when the sitemap has not changed', () => {
    expect(changedUrls({ ...previous }, previous)).toEqual([]);
  });

  it('sends everything against an empty snapshot, as on a first run', () => {
    expect(changedUrls(previous, {})).toEqual(Object.keys(previous));
  });
});
