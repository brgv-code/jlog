// YC Work at a Startup (workatastartup.com) content script — self-contained
export {};

const submittedUrls = new Set<string>();

function getText(selector: string): string {
  return (document.querySelector(selector)?.textContent ?? '').trim();
}

function extractJobDetails(): { company: string; role: string } {
  // workatastartup.com/companies/{company}/jobs/{id}
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
    // Extract from URL path /companies/{slug}/jobs/...
    (() => {
      const match = window.location.pathname.match(/\/companies\/([^/]+)/);
      return match?.[1] ? decodeURIComponent(match[1]).replace(/-/g, ' ') : '';
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
      sourceSite: 'ycombinator',
      appliedAt: Date.now(),
    },
  });
}

document.addEventListener('click', (e) => {
  const target = e.target;
  if (!(target instanceof Element)) return;

  const btn = target.closest('button') ?? target.closest('a');
  if (!btn) return;

  const text = (btn.textContent ?? '').trim().toLowerCase();
  if (text.includes('apply') || text === 'submit') {
    const { company, role } = extractJobDetails();
    if (company && role) {
      setTimeout(() => sendJobDetected(company, role), 500);
    }
  }
});

// Watch for success state
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of Array.from(mutation.addedNodes)) {
      if (!(node instanceof Element)) continue;
      const text = node.textContent ?? '';
      if (
        text.includes('application') &&
        (text.includes('submitted') || text.includes('received'))
      ) {
        const { company, role } = extractJobDetails();
        sendJobDetected(company, role);
      }
    }
  }
});

observer.observe(document.body, { childList: true, subtree: true });
