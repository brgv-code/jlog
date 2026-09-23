import type { ApplicationStatus } from '@jlog/shared';

/**
 * Fixtures for the landing page's interactive demo.
 *
 * Invented, but shaped like the real thing: every one of the six statuses is
 * present because the status palette is judged as a set, the boards are the
 * ones the extension actually has content scripts for, and the dates are
 * spread so the list has a believable recency gradient.
 *
 * Deliberately not a copy of anyone's real pipeline. These are well-known
 * companies used as plausible row labels, not claims about applications.
 */

export interface DemoApplication {
  id: string;
  company: string;
  role: string;
  location: string | null;
  status: ApplicationStatus;
  sourceUrl: string | null;
  sourceSite: string | null;
  appliedAt: string | null;
  createdAt: string;
}

/*
 * Each row's age in days, and where its "Posting" link goes.
 *
 * The links are the companies' real careers pages rather than a per-row
 * `example.com/3`, which rendered as a live anchor on a public page and sent
 * anyone who clicked it to the IANA placeholder domain.
 */
const ROWS: [string, string, string | null, ApplicationStatus, string | null, number, string | null][] =
  [
    ['Linear', 'Senior Product Engineer', 'Remote', 'applied', 'ashby', 6, 'https://linear.app/careers'],
    ['Stripe', 'Staff Frontend Engineer', 'Remote — EU', 'interviewing', 'linkedin', 3, 'https://stripe.com/jobs'],
    ['Vercel', 'Developer Experience Engineer', 'Berlin, DE', 'offer', 'greenhouse', 12, 'https://vercel.com/careers'],
    ['Anthropic', 'Product Engineer', 'Remote — EU', 'interviewing', 'greenhouse', 5, 'https://www.anthropic.com/careers'],
    ['Cloudflare', 'Systems Engineer, Workers', 'Lisbon, PT', 'applied', 'workday', 9, 'https://www.cloudflare.com/careers/'],
    ['Raycast', 'Frontend Engineer', 'London, UK', 'saved', null, 1, null],
    ['Supabase', 'Full-stack Engineer', 'Remote', 'rejected', 'lever', 21, 'https://supabase.com/careers'],
    ['Resend', 'Founding Engineer', 'Remote', 'withdrawn', 'wellfound', 30, 'https://resend.com/careers'],
  ];

/*
 * The baseline SSR and the first client render agree on.
 *
 * Dates want to be relative to now, so the demo never reads as abandoned — but
 * this island is `client:visible`, which Astro still server-renders, and
 * `Date.now()` at module scope bakes the build date into the HTML. Every
 * visitor after that day hydrated with different dates, which is a mismatch
 * React resolves by throwing the table away and re-rendering it.
 *
 * So the dates are built from an argument instead. The constant is what ships
 * in the HTML; `ProductDemo` re-dates once, after mount, where a change is just
 * a render rather than a torn hydration.
 */
export const DEMO_EPOCH = Date.parse('2026-09-22T12:00:00.000Z');

export function demoApplications(now: number = DEMO_EPOCH): DemoApplication[] {
  const daysAgo = (n: number) => new Date(now - n * 864e5).toISOString();

  return ROWS.map(([company, role, location, status, sourceSite, d, sourceUrl], i) => ({
    id: `demo_${i}`,
    company,
    role,
    location,
    status,
    sourceSite,
    sourceUrl,
    appliedAt: status === 'saved' ? null : daysAgo(d),
    createdAt: daysAgo(d),
  }));
}

export const DEMO_APPLICATIONS: DemoApplication[] = demoApplications();

/* ------------------------------------------------------------------ */
/* The tailoring demo: one application, its posting, and the base CV.  */
/* ------------------------------------------------------------------ */

export interface DemoBlock {
  id: string;
  text: string;
}

/** A generated line, plus the two things it is answerable to. */
export interface DemoBullet {
  id: string;
  text: string;
  /** Block id in the base CV this was derived from. */
  cvRef: string;
  /** Block id in the posting this was written to answer. */
  jdRef: string;
}

export const DEMO_TARGET = { company: 'Linear', role: 'Senior Product Engineer' };

export const DEMO_JD: DemoBlock[] = [
  { id: 'jd-intro', text: 'We are looking for a senior product engineer to join our apps team.' },
  { id: 'jd-ds', text: 'You will own our design system and component library end to end.' },
  {
    id: 'jd-perf',
    text: 'Performance is a feature here — our users keep the app open all day, every day.',
  },
  {
    id: 'jd-design',
    text: 'You will work directly with designers on interaction details, not just handoff.',
  },
  { id: 'jd-stack', text: 'Deep experience with TypeScript and React at production scale.' },
  { id: 'jd-perks', text: 'Remote within compatible timezones. Equity. Annual offsite.' },
];

export const DEMO_CV: DemoBlock[] = [
  {
    id: 'cv-ds',
    text: 'Built and maintained the component library at Acme, used by 40 engineers across 6 product teams.',
  },
  {
    id: 'cv-perf',
    text: 'Reduced median dashboard load from 3.2s to 900ms by code-splitting the bundle and deferring analytics.',
  },
  {
    id: 'cv-design',
    text: 'Paired with design weekly to specify interaction and empty states before implementation began.',
  },
  { id: 'cv-stack', text: '8 years TypeScript, 6 years React. Previously Go and Postgres.' },
  {
    id: 'cv-misc',
    text: 'Mentored two juniors through their first year; ran the frontend guild.',
  },
];

/**
 * Note that no generated line introduces a fact absent from the CV column. That
 * is the claim the section around this demo makes, so the fixture has to hold
 * to it or the demo argues against the copy.
 */
export const DEMO_BULLETS: DemoBullet[] = [
  {
    id: 'b1',
    text: 'Owned the design system and component library that 40 engineers across 6 product teams built on.',
    cvRef: 'cv-ds',
    jdRef: 'jd-ds',
  },
  {
    id: 'b2',
    text: 'Cut median dashboard load from 3.2s to 900ms, in an app people keep open all day.',
    cvRef: 'cv-perf',
    jdRef: 'jd-perf',
  },
  {
    id: 'b3',
    text: 'Specified interaction and empty states with designers before build, not after handoff.',
    cvRef: 'cv-design',
    jdRef: 'jd-design',
  },
  {
    id: 'b4',
    text: '8 years of TypeScript and 6 of React, both at production scale.',
    cvRef: 'cv-stack',
    jdRef: 'jd-stack',
  },
];
