// Per-site DOM extraction, reused from the automatic content scripts
// (apps/extension/src/content/*.ts) for the popup's manual "Extract" button.
//
// Content scripts already extract company/role via CSS selectors when they
// detect an Easy Apply success or an external Apply click — but that's a
// narrow trigger. The popup's manual button previously always fell back to
// dumping the whole page's innerText into the LLM, even on a site we already
// know how to read precisely. On LinkedIn's split search-results view
// (/jobs/search-results/?currentJobId=...), that whole-page dump is the
// scrollable list of *other* job cards, not the open job's own details — the
// real posting never reaches the model at all, so no prompt fix can recover
// it. Running the same selectors here, before ever calling the LLM, avoids
// the problem entirely on every site we already have a reader for.
//
// Each extractor must stay self-contained (only `document`/`window`, no
// outer closures) — chrome.scripting.executeScript serializes the function
// and runs it inside the page, it cannot carry any surrounding scope with it.

export interface SiteExtractor {
  name: string;
  matches: (url: string) => boolean;
  extract: () => { company: string; role: string };
}

export const SITE_EXTRACTORS: SiteExtractor[] = [
  {
    name: 'linkedin',
    matches: (url) => /linkedin\.com\/jobs/i.test(url),
    extract: () => {
      function getText(selector: string): string {
        return (document.querySelector(selector)?.textContent ?? '').trim();
      }
      const company =
        getText('.job-details-jobs-unified-top-card__company-name') ||
        getText('.jobs-unified-top-card__company-name') ||
        getText('[data-test-job-company-name]') ||
        getText('.topcard__org-name-link') ||
        getText('.topcard__flavor');
      const role =
        getText('.job-details-jobs-unified-top-card__job-title') ||
        getText('.jobs-unified-top-card__job-title') ||
        getText('[data-test-job-title]') ||
        getText('.topcard__title') ||
        getText('h1.jobs-unified-top-card__job-title');
      return { company, role };
    },
  },
  {
    name: 'greenhouse',
    matches: (url) => /greenhouse\.io/i.test(url),
    extract: () => {
      function getText(selector: string): string {
        return (document.querySelector(selector)?.textContent ?? '').trim();
      }
      const role =
        getText('h1.app-title') ||
        getText('h1[class*="job-title"]') ||
        getText('.job__title h1') ||
        getText('h1') ||
        '';
      const companyFromUrl = (() => {
        const match = window.location.pathname.match(/^\/([^/]+)\/jobs\//);
        if (match?.[1]) return decodeURIComponent(match[1]).replace(/-/g, ' ');
        const hostMatch = window.location.hostname.match(/^(.+)\.greenhouse\.io$/);
        if (hostMatch?.[1] && hostMatch[1] !== 'boards') return hostMatch[1].replace(/-/g, ' ');
        return '';
      })();
      const company =
        getText('.company-name') ||
        getText('[class*="company"]') ||
        getText('.header--title') ||
        companyFromUrl;
      return { company, role };
    },
  },
  {
    name: 'lever',
    matches: (url) => /lever\.co/i.test(url),
    extract: () => {
      function getText(selector: string): string {
        return (document.querySelector(selector)?.textContent ?? '').trim();
      }
      const pathParts = window.location.pathname.split('/').filter(Boolean);
      const role =
        getText('h2[data-qa="posting-name"]') ||
        getText('.posting-headline h2') ||
        getText('h2.posting-name') ||
        getText('h2') ||
        getText('h1') ||
        '';
      const company =
        getText('.main-header-logo img[alt]') ||
        (() => {
          const logo = document.querySelector<HTMLImageElement>(
            '.main-header-logo img, header img',
          );
          return logo?.alt ?? '';
        })() ||
        getText('[class*="company"]') ||
        (pathParts[0] ? decodeURIComponent(pathParts[0]).replace(/-/g, ' ') : '');
      return { company, role };
    },
  },
  {
    name: 'ashby',
    matches: (url) => /ashbyhq\.com/i.test(url),
    extract: () => {
      function getText(selector: string): string {
        return (document.querySelector(selector)?.textContent ?? '').trim();
      }
      const pathParts = window.location.pathname.split('/').filter(Boolean);
      const role =
        getText('h1[class*="job"]') ||
        getText('h1[class*="title"]') ||
        getText('h1[class*="Title"]') ||
        getText('.ashby-job-posting-heading') ||
        getText('h1') ||
        '';
      const company =
        getText('[class*="organizationName"]') ||
        getText('[class*="companyName"]') ||
        getText('[class*="company-name"]') ||
        getText('header h2') ||
        (pathParts[0] ? decodeURIComponent(pathParts[0]).replace(/-/g, ' ') : '');
      return { company, role };
    },
  },
  {
    name: 'wellfound',
    matches: (url) => /wellfound\.com\/jobs/i.test(url),
    extract: () => {
      function getText(selector: string): string {
        return (document.querySelector(selector)?.textContent ?? '').trim();
      }
      const role =
        getText('h1[class*="jobTitle"]') ||
        getText('h1[class*="title"]') ||
        getText('.job-title') ||
        getText('h1') ||
        '';
      const company =
        getText('a[class*="startupName"]') ||
        getText('[class*="companyName"]') ||
        getText('[class*="startup-name"]') ||
        getText('[data-test="startup-name"]') ||
        (() => {
          const parts = window.location.pathname.split('/');
          const jobIdx = parts.indexOf('jobs');
          const slug = parts[jobIdx + 1];
          return jobIdx !== -1 && slug ? decodeURIComponent(slug) : '';
        })();
      return { company, role };
    },
  },
  {
    name: 'ycombinator',
    matches: (url) => /workatastartup\.com/i.test(url),
    extract: () => {
      function getText(selector: string): string {
        return (document.querySelector(selector)?.textContent ?? '').trim();
      }
      const role =
        getText('h1.title') ||
        getText('h1[class*="title"]') ||
        getText('.job-name') ||
        getText('h1') ||
        '';
      const company =
        getText('.company-name') ||
        getText('h2.company-name') ||
        getText('[class*="companyName"]') ||
        getText('.company h2') ||
        (() => {
          const match = window.location.pathname.match(/\/companies\/([^/]+)/);
          return match?.[1] ? decodeURIComponent(match[1]).replace(/-/g, ' ') : '';
        })();
      return { company, role };
    },
  },
];

export function matchSiteExtractor(url: string): SiteExtractor | null {
  return SITE_EXTRACTORS.find((site) => site.matches(url)) ?? null;
}
