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
  extract: () => { company: string; role: string } | Promise<{ company: string; role: string }>;
  // Optional: scope the whole-page text dump used for the LLM fallback to the
  // job details pane rather than document.body. On LinkedIn especially, the
  // page also contains the left nav (unread badges), the job results list,
  // and "People also viewed" — all of which crowd out the real description
  // within the char budget sent to the LLM. Must stay self-contained (only
  // document/window) for the same serialization reason as `extract`.
  extractPageText?: () => string | Promise<string>;
}

export const SITE_EXTRACTORS: SiteExtractor[] = [
  {
    name: 'linkedin',
    matches: (url) => /linkedin\.com\/jobs/i.test(url),
    // LinkedIn has (at least partially) migrated job pages to a server-driven UI
    // (SDUI) renderer: every CSS class is an opaque atomic hash regenerated per
    // build (e.g. `_18f99264 _179f4293`), and even container ids are suffixed
    // with the job posting id (`JobDetails_AboutTheJob_4440528243`), so none of
    // those can be hardcoded selectors. The two stable signals left in that
    // markup are semantic, not styling-derived: `data-sdui-component` on the
    // description block, and an `aria-label="Company, <name>."` wrapper on the
    // company link. Both are scoped to the SPA's async-rendered details pane
    // (`[data-testid="lazy-column"]`), so also poll briefly in case a selector
    // read fires before that pane has re-rendered after a job-card click.
    // Legacy classic-UI selectors are kept as a fallback chain in case an
    // account/session still gets the older markup.
    extract: async () => {
      function getText(selector: string): string {
        return (document.querySelector(selector)?.textContent ?? '').trim();
      }
      // The page can have more than one [data-testid="lazy-column"] (the open
      // job's pane plus sidebar/carousel lists use the same component), and
      // more than one "About the job" match (an empty/hidden duplicate can sit
      // earlier in the DOM, e.g. a pre-hydration placeholder). Pick the first
      // match that actually has text, and scope the title/company search to
      // *its* enclosing lazy-column rather than whichever is first in the DOM.
      function findDetailsPane(): ParentNode {
        const matches = document.querySelectorAll(
          '[data-sdui-component="com.linkedin.sdui.generated.jobseeker.dsl.impl.aboutTheJob"]',
        );
        const about = Array.from(matches).find((el) => (el.textContent ?? '').trim().length > 0);
        return about?.closest('[data-testid="lazy-column"]') ?? document;
      }
      function readRole(pane: ParentNode): string {
        const viewLink = pane.querySelector('a[href*="/jobs/view/"]');
        return (
          getText('.job-details-jobs-unified-top-card__job-title') ||
          getText('.jobs-unified-top-card__job-title') ||
          getText('[data-test-job-title]') ||
          getText('.topcard__title') ||
          getText('h1.jobs-unified-top-card__job-title') ||
          (viewLink?.textContent ?? '').trim()
        );
      }
      function readCompany(pane: ParentNode): string {
        const companyLabel = pane.querySelector('[aria-label^="Company,"]')?.getAttribute('aria-label') ?? '';
        const fromAriaLabel = companyLabel.replace(/^Company,\s*/, '').replace(/\.$/, '').trim();
        return (
          getText('.job-details-jobs-unified-top-card__company-name') ||
          getText('.jobs-unified-top-card__company-name') ||
          getText('[data-test-job-company-name]') ||
          getText('.topcard__org-name-link') ||
          getText('.topcard__flavor') ||
          fromAriaLabel
        );
      }
      const deadline = Date.now() + 2000;
      let pane = findDetailsPane();
      let role = readRole(pane);
      let company = readCompany(pane);
      while ((!role || !company) && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 150));
        pane = findDetailsPane();
        role = readRole(pane);
        company = readCompany(pane);
      }
      return { company, role };
    },
    extractPageText: async () => {
      function textOf(el: HTMLElement | null): string {
        // innerText (not textContent) so block-level boundaries (headings,
        // paragraphs, list items) come through as line breaks instead of
        // being concatenated into one run-on string — LinkedIn's markup has
        // no whitespace text nodes between tags to fall back on. textContent
        // is a fallback for environments without a layout engine (e.g.
        // jsdom tests) and for elements innerText treats as empty (hidden
        // pre-hydration duplicates report empty innerText despite having
        // real textContent).
        return ((el?.innerText || el?.textContent) ?? '').trim();
      }
      function firstNonEmpty(selector: string): HTMLElement | null {
        const matches = document.querySelectorAll<HTMLElement>(selector);
        return Array.from(matches).find((el) => textOf(el).length > 0) ?? null;
      }
      function readContainer(): HTMLElement | null {
        return (
          firstNonEmpty('[data-sdui-component="com.linkedin.sdui.generated.jobseeker.dsl.impl.aboutTheJob"]') ??
          firstNonEmpty('#job-details') ??
          firstNonEmpty('.jobs-description__content') ??
          firstNonEmpty('.jobs-box__html-content') ??
          firstNonEmpty('.jobs-search__job-details--container') ??
          firstNonEmpty('.jobs-details__main-content')
        );
      }
      const deadline = Date.now() + 2000;
      let container = readContainer();
      while (!container && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 150));
        container = readContainer();
      }
      return textOf(container) || document.body.innerText.trim();
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
