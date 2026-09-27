/*
 * The docs, in reading order. The sidebar, the section label above each
 * title and the previous/next links at the bottom of a page all come from
 * this one list, so a page added here is wired everywhere at once.
 */

export interface DocLink {
  title: string;
  href: string;
}

export interface DocGroup {
  title: string;
  pages: DocLink[];
}

export const DOCS: DocGroup[] = [
  {
    title: 'Getting started',
    pages: [
      { title: 'Introduction', href: '/docs' },
      { title: 'Quick start', href: '/docs/quick-start' },
      { title: 'The Chrome extension', href: '/docs/extension' },
    ],
  },
  {
    title: 'Using jlog',
    pages: [
      { title: 'Capturing applications', href: '/docs/capture' },
      { title: 'Autofill', href: '/docs/autofill' },
      { title: 'Tracking and Home', href: '/docs/tracking' },
      { title: 'Your CV and facts', href: '/docs/cv' },
      { title: 'Tailored CVs', href: '/docs/tailored-cv' },
      { title: 'Drafted answers', href: '/docs/drafted-answers' },
    ],
  },
  {
    title: 'Settings',
    pages: [
      { title: 'AI providers', href: '/docs/ai-providers' },
      { title: 'Application answers', href: '/docs/application-answers' },
      { title: 'Plans and billing', href: '/docs/plans' },
    ],
  },
  {
    title: 'Self-hosting',
    pages: [
      { title: 'Overview', href: '/docs/self-hosting' },
      { title: 'Run it locally', href: '/docs/self-hosting/local' },
      { title: 'Sign-in methods', href: '/docs/self-hosting/sign-in' },
      { title: 'Deploy to Cloudflare', href: '/docs/self-hosting/deploy' },
      { title: 'Configuration reference', href: '/docs/self-hosting/configuration' },
    ],
  },
  {
    title: 'Reference',
    pages: [
      { title: 'Data and privacy', href: '/docs/data' },
      { title: 'Troubleshooting', href: '/docs/troubleshooting' },
    ],
  },
];

const FLAT = DOCS.flatMap((g) => g.pages.map((p) => ({ ...p, group: g.title })));

const norm = (path: string) => path.replace(/\/$/, '') || '/';

/** The page at `path`, its section, and its neighbours in reading order. */
export function locate(path: string) {
  const i = FLAT.findIndex((p) => p.href === norm(path));
  return {
    group: i >= 0 ? FLAT[i]?.group : undefined,
    prev: i > 0 ? FLAT[i - 1] : undefined,
    next: i >= 0 && i < FLAT.length - 1 ? FLAT[i + 1] : undefined,
  };
}
