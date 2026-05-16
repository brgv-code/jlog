// Greenhouse content script — self-contained
export {};
// Covers boards.greenhouse.io/{company}/jobs/{id}
// and {company}.greenhouse.io/jobs/{id} (embedded boards)

const submittedUrls = new Set<string>();

function getText(selector: string): string {
  return (document.querySelector(selector)?.textContent ?? '').trim();
}

function extractJobDetails(): { company: string; role: string } {
  const role =
    getText('h1.app-title') ||
    getText('h1[class*="job-title"]') ||
    getText('.job__title h1') ||
    getText('h1') ||
    '';

  // boards.greenhouse.io/{company}/jobs/{id}
  const companyFromUrl = (() => {
    const match = window.location.pathname.match(/^\/([^/]+)\/jobs\//);
    if (match?.[1]) return decodeURIComponent(match[1]).replace(/-/g, ' ');
    // Try hostname: {company}.greenhouse.io
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
}

function sendJobDetected(company: string, role: string): void {
  const url = window.location.href;
  if (submittedUrls.has(url)) return;
  if (!company || !role) return;
  submittedUrls.add(url);

  chrome.runtime.sendMessage({
    type: 'JOB_DETECTED',
    job: {
      company,
      role,
      sourceUrl: url,
      sourceSite: 'greenhouse',
      appliedAt: Date.now(),
    },
  });
}

// Greenhouse: single-page form with a submit button
document.addEventListener('click', (e) => {
  const target = e.target;
  if (!(target instanceof Element)) return;

  const btn = target.closest('button') ?? target.closest('input[type="submit"]');
  if (!btn) return;

  const text = (
    btn instanceof HTMLInputElement ? btn.value : (btn.textContent ?? '')
  ).toLowerCase();
  if (text.includes('submit') || text.includes('apply')) {
    const { company, role } = extractJobDetails();
    if (company && role) {
      setTimeout(() => sendJobDetected(company, role), 1000);
    }
  }
});

// Watch for confirmation page/state after submit
const observer = new MutationObserver(() => {
  const bodyText = document.body.textContent ?? '';
  if (
    bodyText.includes('Application received') ||
    bodyText.includes('Thank you for applying') ||
    bodyText.includes('Your application has been submitted')
  ) {
    const { company, role } = extractJobDetails();
    if (company && role && !submittedUrls.has(window.location.href)) {
      sendJobDetected(company, role);
    }
  }
});

observer.observe(document.body, { childList: true, subtree: true });
