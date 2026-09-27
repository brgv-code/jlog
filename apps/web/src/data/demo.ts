/*
 * The one invented person every marketing page shows, and her search.
 *
 * Ada is a senior frontend engineer in Berlin, so every application is a
 * senior frontend role: a real search looks like this, not like one person
 * applying as a designer, a PM and a staff backend engineer at once. Her CV
 * (on the tailored-CV page) lists Ledgerline and Brightwave, so neither
 * appears here as an application. Companies are Microsoft's fictional ones.
 */

export type Status = 'saved' | 'applied' | 'interviewing' | 'offer';

export const STATUS_LABEL: Record<Status, string> = {
  saved: 'Saved',
  applied: 'Applied',
  interviewing: 'Interview',
  offer: 'Offer',
};

export const PERSON = {
  first: 'Ada',
  last: 'Lovelace',
  email: 'ada.lovelace@example.com',
  phone: '+1 202 555 0142',
  city: 'Berlin, Germany',
  linkedin: 'linkedin.com/in/ada-lovelace',
  github: 'github.com/ada-lovelace',
  notice: 'One month',
};

export interface DemoApplication {
  co: string;
  role: string;
  src: string;
  host: string;
  st: Status;
  when: string;
}

export const APPLICATIONS: DemoApplication[] = [
  {
    co: 'Fabrikam',
    role: 'Senior Frontend Engineer, Payments',
    src: 'Greenhouse',
    host: 'boards.greenhouse.io/fabrikam',
    st: 'applied',
    when: '27 Sep',
  },
  {
    co: 'Northwind',
    role: 'Senior Frontend Engineer',
    src: 'careers page',
    host: 'northwind.com/careers',
    st: 'interviewing',
    when: '19 Sep',
  },
  {
    co: 'Contoso',
    role: 'Senior Frontend Engineer, Design Systems',
    src: 'referral',
    host: 'added by hand',
    st: 'offer',
    when: '2 Sep',
  },
  {
    co: 'Litware',
    role: 'Senior Software Engineer, Frontend',
    src: 'Ashby',
    host: 'jobs.ashbyhq.com/litware',
    st: 'interviewing',
    when: '14 Sep',
  },
  {
    co: 'Tailspin',
    role: 'Senior Frontend Developer',
    src: 'any job page',
    host: 'tailspin.dev/jobs/frontend',
    st: 'applied',
    when: '12 Sep',
  },
  {
    co: 'Woodgrove',
    role: 'Senior Frontend Engineer',
    src: 'LinkedIn',
    host: 'linkedin.com/jobs',
    st: 'saved',
    when: '26 Sep',
  },
  {
    co: 'Proseware',
    role: 'Staff Frontend Engineer',
    src: 'recruiter',
    host: 'added by hand',
    st: 'saved',
    when: '25 Sep',
  },
];

/** The short role, for tight rows: "Senior Frontend Engineer, Payments" → before the comma. */
export const shortRole = (role: string) => role.split(',')[0] ?? role;
