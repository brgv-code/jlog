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

  it('extracts LinkedIn even when a job list sits alongside the real posting in the DOM', () => {
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
    const result = linkedin?.extract();
    expect(result).toEqual({ company: 'Real Employer Inc', role: 'Senior Full Stack Developer' });
  });

  it('falls back through the LinkedIn selector chain when the primary class is absent', () => {
    setBody(`
      <div class="topcard__flavor">Fallback Co</div>
      <h1 class="topcard__title">Fallback Role</h1>
    `);
    const linkedin = SITE_EXTRACTORS.find((s) => s.name === 'linkedin');
    expect(linkedin?.extract()).toEqual({ company: 'Fallback Co', role: 'Fallback Role' });
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

  it('returns empty strings when nothing on the page matches any selector', () => {
    setBody('<div>completely unrelated content</div>');
    const linkedin = SITE_EXTRACTORS.find((s) => s.name === 'linkedin');
    expect(linkedin?.extract()).toEqual({ company: '', role: '' });
  });
});
