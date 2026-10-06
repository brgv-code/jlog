import type { ApplicationStatus } from '@jlog/shared';

/**
 * Maya's job search: about two hundred applications over six months, shaped
 * the way a real search is shaped.
 *
 * It starts slowly, peaks a couple of months in, and settles. Most of what she
 * applied to never answered. A minority turned into interviews, a few into
 * offers, and a steady stream of rejections arrived between one and four weeks
 * after applying. Each status is placed at an age where it is believable: a
 * posting saved yesterday has not had time to reject her, and nothing applied
 * to this week is already an offer.
 *
 * Everything is relative to `now`, so the dashboard reads as a live search no
 * matter when the demo is opened, and generated from a seeded random source,
 * so two demo accounts opened a minute apart look the same.
 */

const DAY = 24 * 60 * 60 * 1000;

export type DemoApplication = {
  id: string;
  company: string;
  role: string;
  location: string;
  status: ApplicationStatus;
  sourceSite: string;
  sourceUrl: string | null;
  createdAt: Date;
  appliedAt: Date | null;
  responseReceivedAt: Date | null;
  updatedAt: Date;
  notes: string | null;
  jobDescription: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string;
};

export type DemoEvent = {
  id: string;
  applicationId: string;
  type: 'created' | 'status_change' | 'note_added' | 'follow_up_sent';
  payload: Record<string, unknown>;
  createdAt: Date;
};

type Ats = 'greenhouse' | 'ashby' | 'lever' | 'workday' | 'personio' | 'ycombinator' | 'wellfound';

/**
 * [name, applicant tracking system, board slug or careers URL, location,
 * GitHub organisation whose avatar is the company's logo].
 *
 * The board slug only matters for the "Posting" link. The GitHub organisation
 * is used to warm the shared logo cache, and is left empty wherever there is
 * any doubt which organisation is the company's own: a missing logo falls back
 * to a monogram, a wrong one is a bug every user sees.
 */
type Company = [name: string, ats: Ats | null, board: string, location: string, github: string];

export const COMPANIES: Company[] = [
  ['Stripe', 'greenhouse', 'stripe', 'Remote (EU)', 'stripe'],
  ['Figma', 'greenhouse', 'figma', 'London, UK', 'figma'],
  ['Airbnb', 'greenhouse', 'airbnb', 'Remote', 'airbnb'],
  ['Cloudflare', 'greenhouse', 'cloudflare', 'Lisbon, Portugal', 'cloudflare'],
  ['Dropbox', 'greenhouse', 'dropbox', 'Remote (EU)', 'dropbox'],
  ['GitLab', 'greenhouse', 'gitlab', 'Remote', 'gitlabhq'],
  ['Datadog', 'greenhouse', 'datadog', 'Amsterdam, Netherlands', 'DataDog'],
  ['Discord', 'greenhouse', 'discord', 'Remote', 'discord'],
  ['Coinbase', 'greenhouse', 'coinbase', 'Remote (EU)', 'coinbase'],
  ['Pinterest', 'greenhouse', 'pinterest', 'Dublin, Ireland', 'pinterest'],
  ['Vercel', 'greenhouse', 'vercel', 'Remote (EU)', 'vercel'],
  ['Anthropic', 'greenhouse', 'anthropic', 'London, UK', 'anthropics'],
  ['GetYourGuide', 'greenhouse', 'getyourguide', 'Berlin, Germany', 'getyourguide'],
  ['Contentful', 'greenhouse', 'contentful', 'Berlin, Germany', 'contentful'],
  ['MongoDB', 'greenhouse', 'mongodb', 'Dublin, Ireland', 'mongodb'],
  ['Elastic', 'greenhouse', 'elastic', 'Remote (EU)', 'elastic'],
  ['Grammarly', 'greenhouse', 'grammarly', 'Berlin, Germany', 'grammarly'],
  ['Duolingo', 'greenhouse', 'duolingo', 'Berlin, Germany', 'duolingo'],
  ['Twilio', 'greenhouse', 'twilio', 'Remote (EU)', 'twilio'],
  ['Celonis', 'greenhouse', 'celonis', 'Munich, Germany', 'celonis'],
  ['N26', 'greenhouse', 'n26', 'Berlin, Germany', 'n26'],
  ['Monzo', 'greenhouse', 'monzo', 'London, UK', 'monzo'],
  ['Intercom', 'greenhouse', 'intercom', 'Dublin, Ireland', 'intercom'],
  ['Databricks', 'greenhouse', 'databricks', 'Amsterdam, Netherlands', 'databricks'],
  ['Asana', 'greenhouse', 'asana', 'Dublin, Ireland', 'Asana'],
  ['Linear', 'ashby', 'linear', 'Remote (EU)', 'linear'],
  ['Notion', 'ashby', 'notion', 'Dublin, Ireland', 'makenotion'],
  ['OpenAI', 'ashby', 'openai', 'London, UK', 'openai'],
  ['Ramp', 'ashby', 'ramp', 'Remote', ''],
  ['Supabase', 'ashby', 'supabase', 'Remote', 'supabase'],
  ['PostHog', 'ashby', 'posthog', 'Remote (EU)', 'PostHog'],
  ['Deel', 'ashby', 'deel', 'Remote', ''],
  ['Replit', 'ashby', 'replit', 'Remote', 'replit'],
  ['Raycast', 'ashby', 'raycast', 'London, UK', 'raycast'],
  ['Resend', 'ashby', 'resend', 'Remote', 'resend'],
  ['Clerk', 'ashby', 'clerk', 'Remote', 'clerk'],
  ['Attio', 'ashby', 'attio', 'London, UK', ''],
  ['ElevenLabs', 'ashby', 'elevenlabs', 'Remote (EU)', ''],
  ['Pitch', 'ashby', 'pitch', 'Berlin, Germany', ''],
  ['Netflix', 'lever', 'netflix', 'Amsterdam, Netherlands', 'Netflix'],
  ['Palantir', 'lever', 'palantir', 'London, UK', 'palantir'],
  ['Spotify', 'lever', 'spotify', 'Stockholm, Sweden', 'spotify'],
  ['Plaid', 'lever', 'plaid', 'London, UK', 'plaid'],
  ['Mistral AI', 'lever', 'mistral', 'Paris, France', 'mistralai'],
  ['Qonto', 'lever', 'qonto', 'Berlin, Germany', ''],
  ['Ledger', 'lever', 'ledger', 'Paris, France', 'LedgerHQ'],
  ['Back Market', 'lever', 'backmarket', 'Paris, France', ''],
  ['Salesforce', 'workday', 'https://careers.salesforce.com', 'Munich, Germany', 'salesforce'],
  ['Adobe', 'workday', 'https://careers.adobe.com', 'Hamburg, Germany', 'adobe'],
  [
    'NVIDIA',
    'workday',
    'https://www.nvidia.com/en-us/about-nvidia/careers/',
    'Berlin, Germany',
    'NVIDIA',
  ],
  ['Booking.com', 'workday', 'https://careers.booking.com', 'Amsterdam, Netherlands', 'bookingcom'],
  ['PayPal', 'workday', 'https://careers.pypl.com', 'Berlin, Germany', 'paypal'],
  ['Taxfix', 'personio', '', 'Berlin, Germany', ''],
  ['Enpal', 'personio', '', 'Berlin, Germany', ''],
  ['Ecosia', 'personio', '', 'Berlin, Germany', ''],
  ['Choco', 'personio', '', 'Berlin, Germany', ''],
  ['Raisin', 'personio', '', 'Berlin, Germany', ''],
  ['Langfuse', 'ycombinator', 'langfuse', 'Berlin, Germany', 'langfuse'],
  ['Mintlify', 'ycombinator', 'mintlify', 'Remote', 'mintlify'],
  ['Trigger.dev', 'ycombinator', 'trigger-dev', 'Remote (EU)', 'triggerdotdev'],
  ['Infisical', 'ycombinator', 'infisical', 'Remote', 'Infisical'],
  ['Cal.com', 'wellfound', 'cal-com', 'Remote', 'calcom'],
  ['Dub', 'wellfound', 'dub', 'Remote', 'dubinc'],
  ['tldraw', 'wellfound', 'tldraw', 'London, UK', 'tldraw'],
  ['Zalando', null, '', 'Berlin, Germany', 'zalando'],
  ['Delivery Hero', null, '', 'Berlin, Germany', 'deliveryhero'],
  ['HelloFresh', null, '', 'Berlin, Germany', 'hellofresh'],
  ['Trade Republic', null, '', 'Berlin, Germany', ''],
  ['Revolut', null, '', 'London, UK', 'revolut'],
  ['Wise', null, '', 'London, UK', 'transferwise'],
  ['Klarna', null, '', 'Stockholm, Sweden', 'klarna'],
  ['Adyen', null, '', 'Amsterdam, Netherlands', 'Adyen'],
  ['Miro', null, '', 'Amsterdam, Netherlands', ''],
  ['Shopify', null, '', 'Remote', 'Shopify'],
  ['Atlassian', null, '', 'Amsterdam, Netherlands', 'atlassian'],
  ['SumUp', null, '', 'Berlin, Germany', 'sumup'],
  ['Babbel', null, '', 'Berlin, Germany', ''],
  ['SoundCloud', null, '', 'Berlin, Germany', 'soundcloud'],
  ['Komoot', null, '', 'Remote (EU)', 'komoot'],
  ['Wolt', null, '', 'Berlin, Germany', ''],
  ['Doctolib', null, '', 'Berlin, Germany', 'doctolib'],
  ['Mollie', null, '', 'Amsterdam, Netherlands', 'mollie'],
  ['JetBrains', null, '', 'Munich, Germany', 'JetBrains'],
  ['Grafana Labs', null, '', 'Remote (EU)', 'grafana'],
  ['Docker', null, '', 'Remote', 'docker'],
  ['Sentry', null, '', 'Vienna, Austria', 'getsentry'],
  ['Microsoft', null, '', 'Berlin, Germany', 'microsoft'],
  ['Google', null, '', 'Munich, Germany', 'google'],
  ['Meta', null, '', 'London, UK', 'facebook'],
  ['Apple', null, '', 'Munich, Germany', 'apple'],
];

/** Company name to GitHub organisation, for the logo warm-up. */
export const LOGO_ORGS: [company: string, org: string][] = COMPANIES.filter(
  ([, , , , gh]) => gh,
).map(([name, , , , gh]) => [name, gh]);

type Family =
  | 'frontend'
  | 'fullstack'
  | 'product'
  | 'platform'
  | 'designsystems'
  | 'growth'
  | 'payments'
  | 'mobile'
  | 'dx'
  | 'accessibility'
  | 'manager'
  | 'founding';

type Level = 'mid' | 'senior' | 'staff';

const ROLES: [title: string, family: Family, level: Level, weight: number][] = [
  ['Senior Frontend Engineer', 'frontend', 'senior', 7],
  ['Senior Full-stack Engineer', 'fullstack', 'senior', 6],
  ['Senior Software Engineer, Frontend', 'frontend', 'senior', 5],
  ['Senior Product Engineer', 'product', 'senior', 5],
  ['Product Engineer', 'product', 'mid', 3],
  ['Staff Frontend Engineer', 'frontend', 'staff', 2],
  ['Senior Software Engineer, Web Platform', 'platform', 'senior', 2],
  ['Frontend Engineer, Design Systems', 'designsystems', 'senior', 2],
  ['Senior Software Engineer, Growth', 'growth', 'senior', 2],
  ['Full-stack Engineer, Payments', 'payments', 'senior', 2],
  ['Senior React Native Engineer', 'mobile', 'senior', 1],
  ['Software Engineer, Developer Experience', 'dx', 'senior', 2],
  ['Lead Frontend Engineer', 'frontend', 'staff', 1],
  ['Senior TypeScript Engineer', 'fullstack', 'senior', 1],
  ['Senior Software Engineer, Accessibility', 'accessibility', 'senior', 1],
  ['Engineering Manager, Frontend', 'manager', 'staff', 1],
];

const STARTUP_ROLES: [string, Family, Level][] = [
  ['Founding Engineer', 'founding', 'senior'],
  ['Founding Full-stack Engineer', 'founding', 'senior'],
  ['Product Engineer', 'product', 'mid'],
];

/** What each kind of role is for, in the posting's own words. */
const MISSION: Record<Family, string> = {
  frontend: 'builds the web app our customers use every day',
  fullstack: 'owns product features end to end, from the database to the interface',
  product: 'ships product quickly and talks to customers directly',
  platform: 'owns the web platform every product team builds on',
  designsystems: 'owns our design system and the component library behind it',
  growth: 'runs experiments across signup, onboarding and activation',
  payments: 'builds the payment and payout flows our merchants rely on',
  mobile: 'builds our mobile apps in React Native',
  dx: 'makes our developer tools, SDKs and docs a pleasure to use',
  accessibility: 'makes sure everything we ship works for everyone',
  manager: 'builds and leads the frontend engineering group',
  founding: 'is building the product from the ground up',
};

const DO: Record<Family | 'any', string[]> = {
  any: [
    'Own features from the first design review to production, and measure whether they worked.',
    'Work closely with design and product to shape what we build next.',
    'Review code, share context generously and help raise the bar for the whole team.',
    'Take part in a light on call rotation and help keep incidents rare and short.',
  ],
  frontend: [
    'Build fast, accessible interfaces in React and TypeScript.',
    'Improve page load and runtime performance across the product.',
    'Shape the architecture of a large frontend codebase as it grows.',
  ],
  fullstack: [
    'Build features across a React frontend and a Node.js and PostgreSQL backend.',
    'Design typed APIs between the frontend and our backend services.',
    'Own the data model behind the features you ship.',
  ],
  product: [
    'Ship small, frequent releases and talk to the customers who use them.',
    'Prototype quickly in React and TypeScript, then harden what works.',
    'Turn customer feedback into product decisions with the founders.',
  ],
  platform: [
    'Own the build, test and release tooling for the web platform.',
    'Introduce end to end testing and make releases safe to run daily.',
    'Improve performance and reliability of the frontend platform.',
  ],
  designsystems: [
    'Build and maintain the shared component library in React and Storybook.',
    'Partner with design to evolve our design system and its tokens.',
    'Help product teams adopt the component library and contribute back to it.',
  ],
  growth: [
    'Design, ship and analyse experiments across the product.',
    'Build and maintain feature flag and experimentation tooling.',
    'Improve conversion through performance and interface work.',
  ],
  payments: [
    'Build payment, payout and reconciliation flows used by merchants daily.',
    'Design typed APIs between our dashboard and payment services.',
    'Replace manual finance processes with reliable product.',
  ],
  mobile: [
    'Build features in our React Native apps for iOS and Android.',
    'Improve booking and checkout flows used by millions of people a year.',
    'Share code and patterns between our mobile and web apps.',
  ],
  dx: [
    'Build SDKs, CLIs and docs that developers enjoy using.',
    'Set up a GraphQL or REST layer that lets teams ship without backend changes.',
    'Improve CI, end to end tests and release tooling for internal teams.',
  ],
  accessibility: [
    'Lead accessibility work across the web app to WCAG 2.1 AA.',
    'Prepare for and pass external accessibility audits.',
    'Teach other engineers how to build accessible components.',
  ],
  manager: [
    'Hire, mentor and grow a team of frontend engineers.',
    'Run architecture reviews and set technical direction for the frontend.',
    'Partner with design and product leadership on the roadmap.',
  ],
  founding: [
    'Build the product end to end in TypeScript, React and Node.js.',
    'Talk to customers every week and turn what you hear into product.',
    'Set up the engineering practices the next ten engineers will inherit.',
  ],
};

const NEED: Record<Family | 'any', string[]> = {
  any: [
    'Five or more years of professional software engineering experience.',
    'Strong communication skills and comfort working in English.',
    'A track record of shipping product that customers use every day.',
    'Experience mentoring other engineers.',
  ],
  frontend: [
    'Deep experience with React and TypeScript.',
    'A strong eye for performance, including page load and rendering.',
    'Experience with testing frontend code, including end to end tests with Playwright or Cypress.',
  ],
  fullstack: [
    'Professional experience with TypeScript, React and Node.js.',
    'Comfort with PostgreSQL and designing APIs.',
    'Experience working across frontend and backend services in production.',
  ],
  product: [
    'Experience shipping product in React and TypeScript.',
    'Product sense and the habit of talking to customers.',
    'Comfort with ambiguity in a small, fast moving team.',
  ],
  platform: [
    'Experience owning CI, build tooling or developer platforms.',
    'Strong React and TypeScript fundamentals.',
    'Experience introducing end to end testing in CI.',
  ],
  designsystems: [
    'Experience building a component library in React, ideally with Storybook.',
    'Close collaboration with design on a design system.',
    'Strong knowledge of accessibility and WCAG.',
  ],
  growth: [
    'Experience running experiments and reading their results.',
    'Familiarity with feature flags and experimentation platforms.',
    'Strong React and TypeScript skills.',
  ],
  payments: [
    'Experience building financial or payments product.',
    'Strong TypeScript and React skills, plus comfort with Go or Node.js services.',
    'Care for correctness in reconciliation and reporting.',
  ],
  mobile: [
    'Professional experience shipping React Native apps.',
    'Experience with large scale booking or checkout flows.',
    'Strong TypeScript skills.',
  ],
  dx: [
    'Experience with GraphQL and REST API design.',
    'Experience building developer tooling, SDKs or docs.',
    'Strong TypeScript and Node.js skills.',
  ],
  accessibility: [
    'Deep knowledge of WCAG 2.1 and assistive technology.',
    'Experience leading an accessibility audit.',
    'Strong React and TypeScript skills.',
  ],
  manager: [
    'Experience managing frontend engineers.',
    'A background as a senior React and TypeScript engineer.',
    'Experience running architecture reviews.',
  ],
  founding: [
    'Experience across the full stack in TypeScript, React, Node.js and PostgreSQL.',
    'Experience at an early stage startup, or the wish to be at one.',
    'Comfort owning product decisions without a spec.',
  ],
};

const NICE = [
  'Experience with Next.js.',
  'Experience with GraphQL.',
  'Familiarity with Go services.',
  'Experience in fintech or health.',
  'Contributions to open source.',
  'German language skills.',
  'Experience with Cloudflare Workers or other edge platforms.',
  'Experience with Redis and feature flags.',
];

const PERKS = [
  'Thirty days of paid holiday.',
  'A learning budget for books, courses and conferences.',
  'Flexible working hours and a hybrid setup.',
  'Equity, so you share in what you help build.',
  'A home office budget for your setup.',
  'Parental leave well above the legal minimum.',
  'Public transport ticket or bike leasing.',
];

const NOTES: Partial<Record<ApplicationStatus, string[]>> = {
  saved: [
    'Looks like a great fit. Tailor the CV around the design system work.',
    'Apply this week, the posting is two weeks old.',
    'Check with Lena whether she knows anyone on the team.',
    'Salary band not listed. Ask the recruiter before applying.',
  ],
  applied: [
    'Applied with the tailored CV.',
    'Referred by a former colleague from Brightwave.',
    'Cover letter mentioned the payouts reconciliation work.',
    'Recruiter viewed my LinkedIn profile two days after applying.',
  ],
  interviewing: [
    'Recruiter call went well. Technical round next week.',
    'Take-home due Friday: build a small dashboard in React.',
    'System design round with the platform team on Thursday.',
    'Final round scheduled: four interviews, half a day.',
    'Hiring manager asked about the Playwright rollout. Prepare numbers.',
  ],
  offer: [
    'Offer received. Negotiating equity and start date.',
    'Verbal offer, written offer expected Monday.',
    'Offer in hand. Decision due by the end of next week.',
  ],
  rejected: [
    'Rejected after the technical round. Feedback: go deeper on testing strategy.',
    'Automated rejection, no feedback.',
    'Position filled internally.',
    'Rejected after the hiring manager call. They wanted more backend depth.',
  ],
  withdrawn: [
    'Withdrew: the role turned out to be mostly backend.',
    'Withdrew after learning the team is fully on site.',
    'Withdrew to focus on later stage processes.',
  ],
};

/** A small, fast, seedable generator, so every demo account gets the same story. */
export function seededRandom(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

type Random = () => number;

const pick = <T>(random: Random, list: readonly T[]): T =>
  list[Math.floor(random() * list.length)] as T;

function pickWeighted<T>(random: Random, list: readonly (readonly [T, number])[]): T {
  const total = list.reduce((n, [, w]) => n + w, 0);
  let roll = random() * total;
  for (const [value, weight] of list) {
    roll -= weight;
    if (roll < 0) return value;
  }
  return (list.at(-1) as readonly [T, number])[0];
}

function sample<T>(random: Random, list: readonly T[], n: number): T[] {
  const copy = [...list];
  const out: T[] = [];
  while (out.length < n && copy.length) {
    out.push(copy.splice(Math.floor(random() * copy.length), 1)[0] as T);
  }
  return out;
}

/** Between `lo` and `hi` days, as a fraction so timestamps do not all land at midnight. */
const days = (random: Random, lo: number, hi: number) => lo + random() * (hi - lo);

/**
 * A believable time of day for something a person did: working hours and
 * evenings, not three in the morning.
 */
function atHumanHour(random: Random, base: number): Date {
  const d = new Date(base);
  d.setUTCHours(7 + Math.floor(random() * 13), Math.floor(random() * 60), 0, 0);
  return d;
}

/**
 * How long until the first reply, drawn from a skewed distribution: a few
 * answer in days, most in one to three weeks, a long tail later.
 */
function responseDelay(random: Random): number {
  return pickWeighted(random, [
    [days(random, 0.5, 3), 14],
    [days(random, 3, 7), 30],
    [days(random, 7, 14), 30],
    [days(random, 14, 28), 19],
    [days(random, 28, 45), 7],
  ] as const);
}

/**
 * How many applications of each status, and how old each may be (in days).
 * The age ranges are what make the funnel believable; the counts are what make
 * the dashboard read like a real, slightly tired, mostly unanswered search.
 */
const PLAN: { status: ApplicationStatus; count: number; age: [number, number]; ramp?: true }[] = [
  // A few from the last day, so the current week on the trend chart is not a
  // cliff when the demo is opened early in a week.
  { status: 'saved', count: 4, age: [0, 1.2] },
  { status: 'applied', count: 4, age: [0.05, 1.2] },
  { status: 'saved', count: 8, age: [1.2, 21] },
  // Bookmarks that never turned into an application. Every search has some.
  { status: 'saved', count: 10, age: [21, 120] },
  // Applied recently enough that silence is still normal.
  { status: 'applied', count: 14, age: [1.2, 13.5] },
  // Applied long enough ago that silence is now the answer.
  { status: 'applied', count: 71, age: [15, 175], ramp: true },
  { status: 'interviewing', count: 14, age: [9, 55] },
  { status: 'offer', count: 3, age: [38, 95] },
  { status: 'rejected', count: 64, age: [9, 175], ramp: true },
  { status: 'withdrawn', count: 8, age: [25, 150] },
];

/**
 * An age in the range, either flat or on a ramp: most likely at the recent
 * end and tapering to nothing at the oldest. Ramped, the older applications
 * draw a search that started slowly and built up, and meet the recent ones at
 * about the same weekly rate instead of leaving a cliff where they join.
 */
function ageIn(random: Random, [lo, hi]: [number, number], ramp = false): number {
  const u = random();
  return ramp ? hi - (hi - lo) * Math.sqrt(1 - u) : lo + u * (hi - lo);
}

function salaryFor(
  random: Random,
  location: string,
  level: Level,
): { min: number; max: number; currency: string } | null {
  if (random() < 0.4) return null;
  const currency = location.endsWith('UK')
    ? 'GBP'
    : location === 'Remote' || location.endsWith('US')
      ? 'USD'
      : 'EUR';
  const base: Record<string, Record<Level, number>> = {
    EUR: { mid: 65, senior: 85, staff: 110 },
    GBP: { mid: 65, senior: 85, staff: 115 },
    USD: { mid: 120, senior: 150, staff: 190 },
  };
  const lo = (base[currency]?.[level] ?? 85) + Math.floor(random() * 4) * 5;
  const spread = currency === 'USD' ? 40 : 25;
  return { min: lo * 1000, max: (lo + spread) * 1000, currency };
}

function postingUrl(ats: Ats | null, board: string, company: string, role: string, source: string) {
  if (source === 'linkedin') {
    return `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(`${role} ${company}`)}`;
  }
  if (!ats || source === 'manual') return null;
  switch (ats) {
    case 'greenhouse':
      return `https://boards.greenhouse.io/${board}`;
    case 'ashby':
      return `https://jobs.ashbyhq.com/${board}`;
    case 'lever':
      return `https://jobs.lever.co/${board}`;
    case 'workday':
      return board;
    case 'ycombinator':
      return `https://www.ycombinator.com/companies/${board}/jobs`;
    case 'wellfound':
      return `https://wellfound.com/company/${board}/jobs`;
    default:
      return null;
  }
}

function jobDescription(
  random: Random,
  company: string,
  role: string,
  family: Family,
  location: string,
  salary: ReturnType<typeof salaryFor>,
): string {
  const money = (n: number, currency: string) =>
    `${currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$'}${Math.round(n / 1000)}k`;
  const lines = [
    `${role}`,
    `${company} · ${location} · Full-time`,
    '',
    'About the role',
    `${company} is hiring a ${role} to join the team that ${MISSION[family]}. You will work closely with design and product, own your work from the first sketch to production, and help shape how we build.`,
    '',
    "What you'll do",
    ...sample(random, DO[family], 3).map((l) => `• ${l}`),
    ...sample(random, DO.any, 2).map((l) => `• ${l}`),
    '',
    "What we're looking for",
    ...sample(random, NEED[family], 3).map((l) => `• ${l}`),
    ...sample(random, NEED.any, 2).map((l) => `• ${l}`),
    '',
    'Nice to have',
    ...sample(random, NICE, 2).map((l) => `• ${l}`),
    '',
    'What we offer',
    ...(salary
      ? [
          `• A salary range of ${money(salary.min, salary.currency)} to ${money(salary.max, salary.currency)}, depending on experience.`,
        ]
      : []),
    ...sample(random, PERKS, 3).map((l) => `• ${l}`),
  ];
  return lines.join('\n');
}

const SOURCE_WEIGHT_DIRECT = 0.62;

export function buildPipeline(now: Date, random: Random = seededRandom(20261006)) {
  const nowMs = now.getTime();
  const applications: DemoApplication[] = [];
  const events: DemoEvent[] = [];
  /** How many roles each company already has, so no employer dominates the list. */
  const perCompany = new Map<string, Set<string>>();

  const slots = PLAN.flatMap((p) =>
    Array.from({ length: p.count }, () => ({
      status: p.status,
      age: ageIn(random, p.age, p.ramp),
    })),
  );

  // The three offers are the story's high points, so they go to companies a
  // room will recognise rather than to whatever the dice pick.
  const offerCompanies = ['Linear', 'GetYourGuide', 'Vercel'];
  let offerIndex = 0;

  for (const slot of slots) {
    let company: Company;
    if (slot.status === 'offer') {
      const name = offerCompanies[offerIndex++] ?? 'Linear';
      company = COMPANIES.find((c) => c[0] === name) as Company;
    } else {
      do {
        company = pick(random, COMPANIES);
      } while ((perCompany.get(company[0])?.size ?? 0) >= 3 || offerCompanies.includes(company[0]));
    }
    const [name, ats, board, location] = company;

    const startup = ats === 'ycombinator' || ats === 'wellfound';
    let title: string;
    let family: Family;
    let level: Level;
    const taken = perCompany.get(name) ?? new Set<string>();
    do {
      if (startup) {
        [title, family, level] = pick(random, STARTUP_ROLES);
      } else {
        [title, family, level] = pickWeighted(
          random,
          ROLES.map(([t, f, l, w]) => [[t, f, l] as const, w] as const),
        );
      }
    } while (taken.has(title) && taken.size < 3);
    taken.add(title);
    perCompany.set(name, taken);

    // Where the posting was found. Most come straight from the company's own
    // board; a large minority from LinkedIn; a handful were referrals typed in
    // by hand.
    const roll = random();
    const source =
      roll < 0.06
        ? 'manual'
        : ats && roll < SOURCE_WEIGHT_DIRECT
          ? ats
          : ats === 'ycombinator' || ats === 'wellfound'
            ? ats
            : 'linkedin';

    // Capped at now: a posting saved this morning cannot have been answered at
    // some later hour today, and moving it to a human hour must not move it
    // past the present.
    const clamp = (d: Date) => (d.getTime() > nowMs ? new Date(nowMs - 60_000) : d);
    const createdAt = clamp(atHumanHour(random, nowMs - slot.age * DAY));
    const salary = salaryFor(random, location, level);
    const id = crypto.randomUUID();
    const appEvents: DemoEvent[] = [];
    const event = (type: DemoEvent['type'], payload: Record<string, unknown>, at: Date) =>
      appEvents.push({ id: crypto.randomUUID(), applicationId: id, type, payload, createdAt: at });

    event('created', { company: name, role: title }, createdAt);

    let appliedAt: Date | null = null;
    let responseReceivedAt: Date | null = null;
    let status: ApplicationStatus = slot.status;

    if (status !== 'saved') {
      // Captured by the extension at the moment of applying, or saved first
      // and applied to a day or two later.
      const savedFirst = random() < 0.45;
      appliedAt = clamp(
        savedFirst ? new Date(createdAt.getTime() + days(random, 0.2, 2.5) * DAY) : createdAt,
      );
      if (savedFirst) event('status_change', { from: 'saved', to: 'applied' }, appliedAt);
    }

    if (appliedAt && (status === 'interviewing' || status === 'offer' || status === 'rejected')) {
      responseReceivedAt = clamp(new Date(appliedAt.getTime() + responseDelay(random) * DAY));
      // A reply cannot land in the future, so a recent application with a
      // long draw is pulled in to "replied today".
      if (responseReceivedAt.getTime() <= appliedAt.getTime()) {
        responseReceivedAt = new Date(appliedAt.getTime() + 0.5 * DAY);
      }
    }

    if (status === 'interviewing' && responseReceivedAt) {
      event('status_change', { from: 'applied', to: 'interviewing' }, responseReceivedAt);
    }
    if (status === 'offer' && responseReceivedAt) {
      event('status_change', { from: 'applied', to: 'interviewing' }, responseReceivedAt);
      const offerAt = clamp(new Date(responseReceivedAt.getTime() + days(random, 12, 25) * DAY));
      event('status_change', { from: 'interviewing', to: 'offer' }, offerAt);
    }
    if (status === 'rejected' && responseReceivedAt) {
      // About a quarter of rejections came after at least one interview.
      if (random() < 0.25) {
        event('status_change', { from: 'applied', to: 'interviewing' }, responseReceivedAt);
        const rejectedAt = clamp(
          new Date(responseReceivedAt.getTime() + days(random, 4, 16) * DAY),
        );
        event('status_change', { from: 'interviewing', to: 'rejected' }, rejectedAt);
      } else {
        event('status_change', { from: 'applied', to: 'rejected' }, responseReceivedAt);
      }
    }
    if (status === 'withdrawn' && appliedAt) {
      const withdrawnAt = clamp(new Date(appliedAt.getTime() + days(random, 6, 20) * DAY));
      event('status_change', { from: 'applied', to: 'withdrawn' }, withdrawnAt);
    }
    if (status === 'applied' && appliedAt && slot.age > 18 && random() < 0.35) {
      event(
        'follow_up_sent',
        { channel: random() < 0.85 ? 'email' : 'whatsapp' },
        clamp(new Date(appliedAt.getTime() + days(random, 8, 14) * DAY)),
      );
    }

    const notePool = NOTES[status] ?? [];
    const notes =
      source === 'manual'
        ? 'Referral from a former colleague. Applied through the internal referral form.'
        : status === 'offer' || status === 'interviewing' || random() < 0.35
          ? pick(random, notePool)
          : null;
    if (notes) {
      const last = appEvents.at(-1)?.createdAt ?? createdAt;
      event(
        'note_added',
        { preview: notes.slice(0, 80) },
        clamp(new Date(last.getTime() + 0.1 * DAY)),
      );
    }

    // Defensive: if a clamp ever reorders anything, the status is still the one
    // the slot asked for. Fixing the label beats a funnel that does not add up.
    status = slot.status;

    applications.push({
      id,
      company: name,
      role: title,
      location,
      status,
      sourceSite: source,
      sourceUrl: postingUrl(ats, board, name, title, source),
      createdAt,
      appliedAt,
      responseReceivedAt,
      updatedAt: appEvents.at(-1)?.createdAt ?? createdAt,
      notes,
      jobDescription: jobDescription(random, name, title, family, location, salary),
      salaryMin: salary?.min ?? null,
      salaryMax: salary?.max ?? null,
      salaryCurrency: salary?.currency ?? 'EUR',
    });
    events.push(...appEvents);
  }

  return { applications, events };
}
