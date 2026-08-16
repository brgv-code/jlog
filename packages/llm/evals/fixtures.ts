export interface ExtractionFixture {
  name: string;
  /** What the extraction path actually sends the model: a page dump, truncated to 6000 chars in the extension. */
  text: string;
  expected: {
    company: string;
    role: string;
    /** null means "expected to come back null" — remote/unspecified per the system prompt's own rule. */
    location: string | null;
  };
  /** Why this fixture exists — what real-world clutter it's reproducing. */
  note: string;
}

export const fixtures: ExtractionFixture[] = [
  {
    name: 'related-jobs-noise',
    text: `Acme Robotics
Careers   Products   Company   Blog

Similar Jobs
Frontend Engineer — Initech — Austin, TX
DevOps Engineer — Globex — Remote
Data Scientist — Globex — New York, NY

Senior Backend Engineer

Acme Robotics is hiring a Senior Backend Engineer to join our platform team in
San Francisco, CA. You'll build the systems that power our warehouse robots,
working closely with the controls and simulation teams.

Responsibilities
- Design and build backend services in Go
- Own the fleet telemetry pipeline end to end
- Partner with the robotics team on real-time control APIs

Requirements
- 5+ years of backend experience
- Experience with distributed systems

Apply now

© 2026 Acme Robotics. All rights reserved.`,
    expected: {
      company: 'Acme Robotics',
      role: 'Senior Backend Engineer',
      location: 'San Francisco, CA',
    },
    note: "A 'Similar Jobs' widget lists three other companies/roles before the real posting appears in document order. Reproduces career pages where sidebar/related-listings content sits above or beside the actual job.",
  },
  {
    name: 'staffing-agency-vs-employer',
    text: `Robert Halligan Staffing
Find talent   Find jobs   About

Job Opening: Senior Data Engineer

Robert Halligan Staffing is partnering with a fast-growing fintech company,
Meridian Payments, to find a Senior Data Engineer for their growing analytics
team. This is a direct-hire, full-time position with Meridian Payments, not a
contract role through our agency.

Location: Chicago, IL (Hybrid, 3 days on-site)

What you'll do at Meridian Payments
- Build and own pipelines feeding the fraud-detection models
- Partner with the data science team on feature stores

About Robert Halligan Staffing
We've been placing top engineering talent with growing companies since 1998.
Browse our other open roles below.

Apply through Robert Halligan Staffing today to be considered for this
position with Meridian Payments.`,
    expected: {
      company: 'Meridian Payments',
      role: 'Senior Data Engineer',
      location: 'Chicago, IL',
    },
    note: "Posted by a staffing agency on behalf of the real employer. This is a judgment call, not an objective fact: jlog's convention is the company the applicant would actually work for, not the agency posting the listing. If a model consistently returns the agency name instead, that's the bug this fixture exists to catch.",
  },
  {
    name: 'remote-multi-location',
    text: `Nimbus Cloud Systems

Product Designer

Nimbus Cloud Systems is looking for a Product Designer. This role can be based
in our New York or London offices, or fully remote within the US or UK —
whichever works best for you.

Team: Product
Employment Type: Full-time

What you'll do
- Own end-to-end design for the billing and onboarding flows
- Run user research sessions across our top three markets
- Partner with engineering and PM on the quarterly roadmap

What we're looking for
- 4+ years of product design experience
- A portfolio showing shipped, complex B2B products

Nimbus Cloud Systems is an equal opportunity employer.`,
    expected: { company: 'Nimbus Cloud Systems', role: 'Product Designer', location: null },
    note: "Role lists two offices plus a remote option. Per the system prompt's own rule ('null ... if fully remote or not mentioned'), an ambiguous multi-region-plus-remote posting like this should resolve to null, not one arbitrarily chosen city. A model returning 'New York' or 'London' here is picking the first mention, not following the rule.",
  },
  {
    name: 'linkedin-notifications-and-similar-jobs',
    text: `Home 3   My Network 12   Jobs   Messaging 8   Notifications 41   Me

Search jobs, companies

Cedar Ridge Analytics
Follow

Staff Machine Learning Engineer
Cedar Ridge Analytics · Seattle, WA (Hybrid) · 340 applicants

About the job
Cedar Ridge Analytics is hiring a Staff Machine Learning Engineer to lead our
forecasting platform team. You will own the model architecture that powers
demand predictions for hundreds of retail partners.

Responsibilities
- Design and ship the next generation forecasting models
- Mentor a team of four ML engineers
- Partner with product on the roadmap for the forecasting platform

Qualifications
- 8+ years of ML engineering experience
- Track record shipping production forecasting or ranking systems

People also viewed
Machine Learning Engineer — Baystone Retail — Chicago, IL
Senior Data Scientist — Harborline Group — Remote
ML Platform Engineer — Baystone Retail — Seattle, WA
Applied Scientist — Harborline Group — New York, NY

Cedar Ridge Analytics · 2,400 followers
11 comments · 89 reactions

© 2026 LinkedIn Corporation`,
    expected: {
      company: 'Cedar Ridge Analytics',
      role: 'Staff Machine Learning Engineer',
      location: 'Seattle, WA',
    },
    note: "The literal failure a user reported: LinkedIn's top nav carries unread-count badges ('Notifications 41', 'Messaging 8') right at the start of the page dump, and a 'People also viewed' module below the real posting lists four other companies and roles. Both are exactly the kind of chrome document.body.innerText picks up that a DOM-scoped scrape (LinkedIn actually has one, see apps/extension/src/content/linkedin.ts) would never include — this fixture exists for the popup's manual-extract fallback path, which has no such scoping.",
  },
  {
    name: 'cookie-nav-clutter',
    text: `We use cookies to improve your experience.   Accept All   Manage Preferences

Skip to content

Vantage Health
Home   About   Careers   Contact   Blog   Investors

Subscribe to our newsletter for company updates!   Email address   Subscribe

Vantage Health — Careers

Registered Nurse, ICU

Vantage Health is hiring a Registered Nurse for our ICU unit in Denver, CO.
Join a mission-driven team providing critical care to patients across the
Rocky Mountain region.

Requirements
- Active RN license
- 2+ years of ICU experience
- BLS and ACLS certification

Vantage Health is an Equal Opportunity Employer. Vantage Health does not
discriminate on the basis of race, color, religion, sex, national origin, age,
disability, or any other protected characteristic.

Follow us: Twitter   LinkedIn   Instagram
Privacy Policy   Terms of Service   Cookie Settings
© 2026 Vantage Health`,
    expected: { company: 'Vantage Health', role: 'Registered Nurse', location: 'Denver, CO' },
    note: "Cookie banner, nav links (including a literal 'Careers' link), and a newsletter signup all precede the real posting, reproducing a raw document.body.innerText dump. A model latching onto nav/footer text ('Careers', 'About') instead of the actual job title is the failure this guards against.",
  },
  {
    name: 'minimal-clean-posting',
    text: `Bright Path Learning

Elementary School Teacher

Bright Path Learning is hiring an Elementary School Teacher in Portland, OR.
Full-time, in-person, starting this fall.

Apply below.`,
    expected: {
      company: 'Bright Path Learning',
      role: 'Elementary School Teacher',
      location: 'Portland, OR',
    },
    note: 'Control case, no noise. If this one fails, the problem is the harness or the provider, not page-text robustness.',
  },
];
