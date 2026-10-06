/**
 * The invented person behind every demo account.
 *
 * Maya is a senior full-stack engineer in Berlin, and her search looks like one
 * person's search: frontend, full-stack and product engineering roles, mostly
 * in Europe, some remote. Her employers are made up. The companies she applies
 * to are real ones used as plausible row labels, the same way the landing page
 * uses them, and make no claim about anyone's hiring.
 *
 * The CV is written as the text a PDF import produces, because that is the
 * path most real users take. Every bullet below appears verbatim in `CV_TEXT`,
 * which is what lets the tailoring view highlight the line a generated bullet
 * came from.
 */

export const PERSONA = {
  firstName: 'Maya',
  lastName: 'Chen',
  title: 'Senior Full-stack Engineer',
  address: 'Berlin, Germany',
  /** Shown on the CV. Deliberately not the account's sign-in address. */
  email: 'maya.chen@example.com',
  homepage: 'mayachen.dev',
  phone: '+49 30 5550 1427',
} as const;

export type DemoRole = {
  employer: string;
  roleTitle: string;
  location: string;
  dates: string;
  bullets: string[];
};

export const ROLES: DemoRole[] = [
  {
    employer: 'Ledgerline',
    roleTitle: 'Senior Software Engineer',
    location: 'Berlin',
    dates: '2022 – present',
    bullets: [
      'Led the rebuild of the merchant dashboard in React and TypeScript, cutting median page load from 4.1s to 1.3s.',
      'Designed a typed API layer between Next.js and twelve Go services, removing the class of runtime errors behind 30% of frontend incidents.',
      'Built the payouts reconciliation view used by 2,000 merchants every day, replacing a manual spreadsheet process.',
      'Introduced Playwright end to end tests in CI and moved releases from fortnightly to daily.',
      'Mentored four engineers and ran the monthly frontend architecture review.',
      'Partnered with design on a shared component library in Storybook, adopted by five product teams.',
    ],
  },
  {
    employer: 'Brightwave Health',
    roleTitle: 'Software Engineer',
    location: 'Hamburg',
    dates: '2019 – 2022',
    bullets: [
      'Shipped the patient booking flow in React Native, used for 1.2 million appointments a year.',
      'Moved the reporting endpoints of a Rails monolith to Node.js and PostgreSQL, reducing p95 latency by 60%.',
      'Implemented WCAG 2.1 AA accessibility across the web app and passed the first external audit with no critical findings.',
      'Built a feature flag service on Redis that let product teams run 40 experiments in its first year.',
      'Owned on call for the scheduling platform and wrote the incident runbooks the team still uses.',
    ],
  },
  {
    employer: 'Kitestring Studio',
    roleTitle: 'Frontend Developer',
    location: 'Berlin',
    dates: '2017 – 2019',
    bullets: [
      'Delivered 14 client sites and web apps in Vue and React for retail and media clients.',
      'Set up a GraphQL gateway over legacy REST APIs so frontend teams could ship without backend changes.',
      'Raised average Lighthouse performance scores from 58 to 91 through image, font and bundle work.',
    ],
  },
  {
    employer: 'Nordpack Logistics',
    roleTitle: 'Junior Developer',
    location: 'Leipzig',
    dates: '2016 – 2017',
    bullets: [
      'Built internal tools in JavaScript and Python for warehouse shift planning.',
      'Automated weekly carrier reports with Python and SQL, saving the operations team a day of work each week.',
    ],
  },
];

export const SUMMARY =
  'Full-stack engineer with eight years of building product for fintech and health. I care about typed systems, fast interfaces and teams that ship every day.';

export const SECTIONS: { heading: string; items: { left: string; right: string }[] }[] = [
  {
    heading: 'Education',
    items: [{ left: '2012 – 2016', right: 'B.Sc. Computer Science, TU Dresden' }],
  },
  {
    heading: 'Skills',
    items: [
      { left: 'Languages', right: 'TypeScript, JavaScript, Go, Python, SQL' },
      { left: 'Frontend', right: 'React, Next.js, React Native, Vue, Tailwind CSS, Storybook' },
      { left: 'Backend', right: 'Node.js, PostgreSQL, Redis, GraphQL, REST' },
      {
        left: 'Tooling',
        right: 'Playwright, Vitest, GitHub Actions, Docker, AWS, Cloudflare Workers',
      },
    ],
  },
  {
    heading: 'Languages',
    items: [
      { left: 'English', right: 'Fluent' },
      { left: 'German', right: 'Professional (C1)' },
      { left: 'Mandarin', right: 'Native' },
    ],
  },
];

export const SOCIALS = [
  { network: 'linkedin', handle: 'mayachen-demo' },
  { network: 'github', handle: 'mayachen-demo' },
];

export const AUTOFILL = {
  phone: PERSONA.phone,
  authorizedCountries: ['Germany', 'EU'],
  salaryExpectation: '€95,000 to €110,000',
  noticePeriod: 'Three months',
  eeo: 'decline' as const,
};

/**
 * The CV as an import would have read it out of a PDF. Built from the data
 * above rather than typed out twice, so a bullet cannot drift from the line
 * the tailoring view highlights for it.
 */
export const CV_TEXT = [
  `${PERSONA.firstName} ${PERSONA.lastName}`,
  PERSONA.title,
  `${PERSONA.address} · ${PERSONA.email} · ${PERSONA.homepage} · linkedin.com/in/mayachen-demo`,
  '',
  'SUMMARY',
  SUMMARY,
  '',
  'EXPERIENCE',
  ...ROLES.flatMap((role) => [
    '',
    `${role.employer} — ${role.roleTitle}`,
    `${role.location} · ${role.dates}`,
    ...role.bullets.map((b) => `• ${b}`),
  ]),
  '',
  'EDUCATION',
  'B.Sc. Computer Science, TU Dresden · 2012 – 2016',
  '',
  'SKILLS',
  ...(SECTIONS.find((s) => s.heading === 'Skills')?.items ?? []).map(
    (i) => `${i.left}: ${i.right}`,
  ),
  '',
  'LANGUAGES',
  'English (fluent) · German (C1) · Mandarin (native)',
  '',
].join('\n');

/**
 * Phrasings of a few bullets written for earlier applications. They are what
 * make the tailoring view's "used for N applications" history non-empty, and
 * they give the model real alternatives to choose between.
 */
export const HISTORY_VARIANTS: {
  employer: string;
  bulletIndex: number;
  content: string;
  company: string;
  roleTitle: string;
}[] = [
  {
    employer: 'Ledgerline',
    bulletIndex: 0,
    content:
      'Rebuilt the merchant dashboard in React and TypeScript and cut median page load from 4.1s to 1.3s.',
    company: 'Stripe',
    roleTitle: 'Senior Frontend Engineer',
  },
  {
    employer: 'Ledgerline',
    bulletIndex: 0,
    content:
      'Owned the performance rebuild of a merchant dashboard, taking median page load from 4.1s to 1.3s.',
    company: 'Adyen',
    roleTitle: 'Senior Software Engineer, Frontend',
  },
  {
    employer: 'Ledgerline',
    bulletIndex: 3,
    content:
      'Brought Playwright end to end tests into CI, which made daily releases safe instead of fortnightly ones.',
    company: 'Vercel',
    roleTitle: 'Senior Software Engineer',
  },
  {
    employer: 'Brightwave Health',
    bulletIndex: 2,
    content:
      'Made the web app WCAG 2.1 AA compliant and passed an external accessibility audit with no critical findings.',
    company: 'Zalando',
    roleTitle: 'Senior Frontend Engineer',
  },
];
