// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { SITE_EXTRACTORS, matchSiteExtractor } from './domExtractors';

function setBody(html: string): void {
  document.body.innerHTML = html;
}

describe('domExtractors', () => {
  it('matches known sites and rejects unknown ones', () => {
    expect(matchSiteExtractor('https://www.linkedin.com/jobs/view/1234')?.name).toBe('linkedin');
    expect(matchSiteExtractor('https://boards.greenhouse.io/acme/jobs/1')?.name).toBe('greenhouse');
    expect(matchSiteExtractor('https://jobs.lever.co/acme/abc')?.name).toBe('lever');
    expect(matchSiteExtractor('https://example.com/some/random/page')).toBeNull();
  });

  it('extracts LinkedIn even when a job list sits alongside the real posting in the DOM', async () => {
    // Reproduces the real reported bug: LinkedIn's split search-results view keeps
    // several other job cards in the DOM around the real, open job's detail panel.
    // document.body.innerText (the old path) reads in document order and can miss
    // the real posting inside a truncated slice; querySelector reaches the tagged
    // element directly regardless of where it sits, which is the whole fix.
    setBody(`
      <nav>Notifications 41 Messaging 8</nav>
      <div class="jobs-search-results-list">
        <div class="job-card">Frontend Engineer — Initech</div>
        <div class="job-card">Senior AI Software Engineer — NiCE</div>
        <div class="job-card">Senior Frontend Engineer — Synthesia</div>
      </div>
      <div class="job-details-jobs-unified-top-card">
        <h1 class="job-details-jobs-unified-top-card__job-title">Senior Full Stack Developer</h1>
        <span class="job-details-jobs-unified-top-card__company-name">Real Employer Inc</span>
      </div>
    `);
    const linkedin = SITE_EXTRACTORS.find((s) => s.name === 'linkedin');
    expect(linkedin).toBeDefined();
    const result = await linkedin?.extract();
    expect(result).toEqual({ company: 'Real Employer Inc', role: 'Senior Full Stack Developer' });
  });

  it('falls back through the LinkedIn selector chain when the primary class is absent', async () => {
    setBody(`
      <div class="topcard__flavor">Fallback Co</div>
      <h1 class="topcard__title">Fallback Role</h1>
    `);
    const linkedin = SITE_EXTRACTORS.find((s) => s.name === 'linkedin');
    await expect(linkedin?.extract()).resolves.toEqual({
      company: 'Fallback Co',
      role: 'Fallback Role',
    });
  });

  it('extracts LinkedIn from the SDUI-rendered pane (hashed classes, no stable BEM selectors)', async () => {
    // Reproduces the real markup LinkedIn now serves on at least some job pages:
    // every class is an opaque atomic hash and the container id is suffixed with
    // the job posting id, so only the semantic `data-sdui-component` attribute
    // and the `aria-label="Company, X."` wrapper are usable as selectors. Also
    // includes a decoy [data-testid="lazy-column"] (e.g. a sidebar job list)
    // ahead of the real one in the DOM, reproducing the reported bug where the
    // first lazy-column on the page — not the one containing the open job —
    // got picked for title/company.
    setBody(`
      <div data-testid="lazy-column">
        <a href="https://www.linkedin.com/jobs/view/9999999999/?trackingId=xyz">Decoy Sidebar Job</a>
        <div aria-label="Company, Decoy Inc.">
          <a href="https://www.linkedin.com/company/decoy/life/">Decoy Inc</a>
        </div>
      </div>
      <div data-testid="lazy-column">
        <p>
          <a href="https://www.linkedin.com/jobs/view/4440528243/?trackingId=abc">Staff Engineer - Fullstack</a>
        </p>
        <div aria-label="Company, Staffbase.">
          <a href="https://www.linkedin.com/company/staffbase/life/">Staffbase</a>
        </div>
        <div id="JobDetails_AboutTheJob_4440528243">
          <div data-sdui-component="com.linkedin.sdui.generated.jobseeker.dsl.impl.aboutTheJob">
            <h2>About the job</h2>
            <p>We inspire people to achieve great things together.</p>
          </div>
        </div>
      </div>
    `);
    const linkedin = SITE_EXTRACTORS.find((s) => s.name === 'linkedin');
    await expect(linkedin?.extract()).resolves.toEqual({
      company: 'Staffbase',
      role: 'Staff Engineer - Fullstack',
    });
    const pageText = await linkedin?.extractPageText?.();
    expect(pageText).toContain('About the job');
    expect(pageText).toContain('We inspire people to achieve great things together.');
    expect(pageText).not.toContain('Decoy');
  });

  it('skips an empty duplicate "About the job" node and uses the populated one', async () => {
    // LinkedIn can render a second, empty copy of the data-sdui-component node
    // (e.g. a pre-hydration placeholder) earlier in the DOM than the real one.
    // A plain querySelector picks that first, empty match and returns nothing;
    // this reproduces that regression.
    setBody(`
      <div data-sdui-component="com.linkedin.sdui.generated.jobseeker.dsl.impl.aboutTheJob"></div>
      <div data-testid="lazy-column">
        <p><a href="https://www.linkedin.com/jobs/view/111/?trackingId=abc">Some Role</a></p>
        <div aria-label="Company, Acme.">
          <a href="https://www.linkedin.com/company/acme/life/">Acme</a>
        </div>
        <div data-sdui-component="com.linkedin.sdui.generated.jobseeker.dsl.impl.aboutTheJob">
          <h2>About the job</h2>
          <p>Real description text.</p>
        </div>
      </div>
    `);
    const linkedin = SITE_EXTRACTORS.find((s) => s.name === 'linkedin');
    await expect(linkedin?.extract()).resolves.toEqual({ company: 'Acme', role: 'Some Role' });
    const pageText = await linkedin?.extractPageText?.();
    expect(pageText).toContain('Real description text.');
  });

  it('extracts Greenhouse from the URL when no company element is present', () => {
    Object.defineProperty(window, 'location', {
      value: new URL('https://boards.greenhouse.io/acme-robotics/jobs/12345'),
      writable: true,
    });
    setBody('<h1 class="app-title">Senior Backend Engineer</h1>');
    const greenhouse = SITE_EXTRACTORS.find((s) => s.name === 'greenhouse');
    expect(greenhouse?.extract()).toEqual({
      company: 'acme robotics',
      role: 'Senior Backend Engineer',
    });
  });

  it('returns empty strings when nothing on the page matches any selector', async () => {
    setBody('<div>completely unrelated content</div>');
    const linkedin = SITE_EXTRACTORS.find((s) => s.name === 'linkedin');
    await expect(linkedin?.extract()).resolves.toEqual({ company: '', role: '' });
  }, 5000);
});
