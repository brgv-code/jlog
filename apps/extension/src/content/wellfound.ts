// Wellfound (formerly AngelList Talent) content script — self-contained
export {};

const submittedUrls = new Set<string>();

function getText(selector: string): string {
  return (document.querySelector(selector)?.textContent ?? '').trim();
}

function extractJobDetails(): { company: string; role: string } {
  // Wellfound job page: /jobs/{company}/{role-slug}
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
    // Fall back to extracting from URL: /jobs/{company}/...
    (() => {
      const parts = window.location.pathname.split('/');
      const jobIdx = parts.indexOf('jobs');
      const slug = parts[jobIdx + 1];
      return jobIdx !== -1 && slug ? decodeURIComponent(slug) : '';
    })();

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
      sourceSite: 'wellfound',
      appliedAt: Date.now(),
    },
  });
}

// Watch for apply button clicks and confirmation modals
document.addEventListener('click', (e) => {
  const target = e.target;
  if (!(target instanceof Element)) return;

  const btn = target.closest('button');
  if (!btn) return;

  const text = (btn.textContent ?? '').trim().toLowerCase();
  if (text === 'apply' || text === 'apply now' || text === 'submit application') {
    const { company, role } = extractJobDetails();
    if (company && role) {
      // Small delay to let any confirmation step register
      setTimeout(() => sendJobDetected(company, role), 500);
    }
  }
});

// Watch for success confirmation in DOM
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of Array.from(mutation.addedNodes)) {
      if (!(node instanceof Element)) continue;
      const text = node.textContent ?? '';
      if (
        text.includes('Application submitted') ||
        text.includes('application has been sent') ||
        text.includes('Successfully applied')
      ) {
        const { company, role } = extractJobDetails();
        sendJobDetected(company, role);
      }
    }
  }
});

observer.observe(document.body, { childList: true, subtree: true });
