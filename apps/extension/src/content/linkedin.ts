// LinkedIn content script — self-contained, no imports from node_modules

// Track URLs already submitted in this session to avoid duplicates
const submittedUrls = new Set<string>();

function getTextContent(selector: string): string {
  return (document.querySelector(selector)?.textContent ?? '').trim();
}

function extractJobDetails(): { company: string; role: string } {
  // Primary selectors for LinkedIn's job details card
  const company =
    getTextContent('.job-details-jobs-unified-top-card__company-name') ||
    getTextContent('.jobs-unified-top-card__company-name') ||
    getTextContent('[data-test-job-company-name]') ||
    getTextContent('.topcard__org-name-link') ||
    getTextContent('.topcard__flavor');

  const role =
    getTextContent('.job-details-jobs-unified-top-card__job-title') ||
    getTextContent('.jobs-unified-top-card__job-title') ||
    getTextContent('[data-test-job-title]') ||
    getTextContent('.topcard__title') ||
    getTextContent('h1.jobs-unified-top-card__job-title');

  return { company, role };
}

function isApplicationSuccessModal(node: Node): boolean {
  if (!(node instanceof Element)) return false;

  const text = node.textContent ?? '';
  const successPhrases = [
    'Your application was submitted',
    'Application submitted',
    'application was sent',
    'Your application has been submitted',
  ];

  for (const phrase of successPhrases) {
    if (text.includes(phrase)) return true;
  }

  // Check for confirmation element with specific roles/classes
  if (
    node.querySelector('.artdeco-inline-feedback--success') ||
    node.querySelector('[data-test-modal-id="easy-apply-success"]') ||
    node.querySelector('.jobs-easy-apply-content')
  ) {
    const innerText = node.textContent ?? '';
    if (
      innerText.includes('submitted') ||
      innerText.includes('Application') ||
      innerText.includes('applied')
    ) {
      return true;
    }
  }

  return false;
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
      sourceSite: 'linkedin',
      appliedAt: Date.now(),
    },
  });
}

// Watch for Easy Apply success modal via MutationObserver
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of Array.from(mutation.addedNodes)) {
      if (isApplicationSuccessModal(node)) {
        const { company, role } = extractJobDetails();
        sendJobDetected(company, role);
      }
    }

    // Also check for attribute/character data changes on existing nodes
    if (mutation.type === 'childList' && mutation.target instanceof Element) {
      if (isApplicationSuccessModal(mutation.target)) {
        const { company, role } = extractJobDetails();
        sendJobDetected(company, role);
      }
    }
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

// Case 2: Watch for external "Apply" button clicks
document.addEventListener('click', (e) => {
  const target = e.target;
  if (!(target instanceof Element)) return;

  const anchor = target.closest('a');
  const button = target.closest('button');
  const el = anchor ?? button;
  if (!el) return;

  const text = (el.textContent ?? '').trim().toLowerCase();
  if (!text.includes('apply')) return;

  // Only fire for external apply links (anchor with href pointing away from linkedin)
  if (anchor) {
    const href = anchor.getAttribute('href') ?? '';
    if (href.startsWith('http') && !href.includes('linkedin.com')) {
      const { company, role } = extractJobDetails();
      if (company && role) {
        sendJobDetected(company, role);
      }
    }
  }
});
