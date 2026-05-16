// Ashby HQ content script — self-contained
export {};
// Covers jobs.ashbyhq.com/{company}/{role-slug}

const submittedUrls = new Set<string>();

function getText(selector: string): string {
  return (document.querySelector(selector)?.textContent ?? '').trim();
}

function extractJobDetails(): { company: string; role: string } {
  // URL: jobs.ashbyhq.com/{company}/{role-slug}
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
    // Extract from URL: first path segment is the company slug
    (pathParts[0] ? decodeURIComponent(pathParts[0]).replace(/-/g, ' ') : '');

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
      sourceSite: 'ashby',
      appliedAt: Date.now(),
    },
  });
}

// Ashby uses a multi-step form — watch for final submission
document.addEventListener('click', (e) => {
  const target = e.target;
  if (!(target instanceof Element)) return;

  const btn = target.closest('button');
  if (!btn) return;

  const text = (btn.textContent ?? '').trim().toLowerCase();
  // Ashby's submit button text varies: "Submit Application", "Submit", "Apply"
  if (text.includes('submit') || text === 'apply') {
    const { company, role } = extractJobDetails();
    if (company && role) {
      setTimeout(() => sendJobDetected(company, role), 1000);
    }
  }
});

// Watch for the thank-you / confirmation page that Ashby navigates to
const observer = new MutationObserver(() => {
  const bodyText = document.body.textContent ?? '';
  if (
    bodyText.includes('Thank you for applying') ||
    bodyText.includes('application has been received') ||
    bodyText.includes('Application submitted')
  ) {
    const { company, role } = extractJobDetails();
    if (company && role && !submittedUrls.has(window.location.href)) {
      sendJobDetected(company, role);
    }
  }
});

observer.observe(document.body, { childList: true, subtree: true, characterData: false });
