// Lever content script — self-contained
export {};
// Covers jobs.lever.co/{company}/{job-id}

const submittedUrls = new Set<string>();

function getText(selector: string): string {
  return (document.querySelector(selector)?.textContent ?? '').trim();
}

function extractJobDetails(): { company: string; role: string } {
  // URL: jobs.lever.co/{company}/{job-id}
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
    // img alt attribute as company name
    (() => {
      const logo = document.querySelector<HTMLImageElement>('.main-header-logo img, header img');
      return logo?.alt ?? '';
    })() ||
    getText('[class*="company"]') ||
    // Extract from URL: first path segment
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
      sourceSite: 'lever',
      appliedAt: Date.now(),
    },
  });
}

// Lever: single application form, watch for submit
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

// Watch for Lever's thank-you page (navigates to /confirmation or adds thank-you content)
const observer = new MutationObserver(() => {
  const bodyText = document.body.textContent ?? '';
  if (
    bodyText.includes('Your application has been submitted') ||
    bodyText.includes('Thanks for applying') ||
    bodyText.includes('application was received')
  ) {
    const { company, role } = extractJobDetails();
    if (company && role && !submittedUrls.has(window.location.href)) {
      sendJobDetected(company, role);
    }
  }
});

observer.observe(document.body, { childList: true, subtree: true });
