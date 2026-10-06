import { describe, expect, it } from 'vitest';
import { demoDraftAnswer, demoExtract, demoTailorAnswer, parseCatalogue } from './model';
import { CV_TEXT, ROLES } from './persona';
import { buildPipeline } from './pipeline';

const NOW = new Date('2026-10-06T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

describe('buildPipeline', () => {
  const { applications, events } = buildPipeline(NOW);

  it('makes about two hundred applications across every status', () => {
    expect(applications).toHaveLength(200);
    const counts = Object.fromEntries(
      ['saved', 'applied', 'interviewing', 'offer', 'rejected', 'withdrawn'].map((s) => [
        s,
        applications.filter((a) => a.status === s).length,
      ]),
    );
    expect(counts).toEqual({
      saved: 22,
      applied: 89,
      interviewing: 14,
      offer: 3,
      rejected: 64,
      withdrawn: 8,
    });
  });

  it('never dates anything in the future or out of order', () => {
    for (const a of applications) {
      expect(a.createdAt.getTime()).toBeLessThanOrEqual(NOW.getTime());
      if (a.status === 'saved') expect(a.appliedAt).toBeNull();
      else expect(a.appliedAt?.getTime()).toBeGreaterThanOrEqual(a.createdAt.getTime());
      if (a.responseReceivedAt) {
        expect(a.responseReceivedAt.getTime()).toBeGreaterThan(a.appliedAt?.getTime() ?? 0);
        expect(a.responseReceivedAt.getTime()).toBeLessThanOrEqual(NOW.getTime());
      }
    }
    for (const e of events) expect(e.createdAt.getTime()).toBeLessThanOrEqual(NOW.getTime());
  });

  it('gives every reply-bearing status a response time and the dashboard its attention tiles', () => {
    for (const a of applications) {
      const replied = ['interviewing', 'offer', 'rejected'].includes(a.status);
      expect(Boolean(a.responseReceivedAt)).toBe(replied);
    }
    const applied = applications.filter((a) => a.status === 'applied');
    const ghosted = applied.filter((a) => (a.appliedAt?.getTime() ?? 0) < NOW.getTime() - 14 * DAY);
    expect(ghosted.length).toBeGreaterThan(40);
    expect(applied.length - ghosted.length).toBeGreaterThan(12);
  });

  it('fills most of the 26-week trend so the chart has a shape', () => {
    const weeks = new Set(
      applications.map((a) => Math.floor((NOW.getTime() - a.createdAt.getTime()) / (7 * DAY))),
    );
    expect([...weeks].filter((w) => w < 26).length).toBeGreaterThanOrEqual(22);
  });

  it('starts every timeline with a created event and ends it at updatedAt', () => {
    for (const a of applications) {
      const own = events.filter((e) => e.applicationId === a.id);
      expect(own[0]?.type).toBe('created');
      expect(own.at(-1)?.createdAt.getTime()).toBe(a.updatedAt.getTime());
    }
  });

  it('gives every application a job description to tailor against', () => {
    for (const a of applications) expect(a.jobDescription).toContain("What we're looking for");
  });

  it('is the same story every time', () => {
    const again = buildPipeline(NOW).applications;
    expect(again.map((a) => `${a.company}|${a.role}|${a.status}`)).toEqual(
      applications.map((a) => `${a.company}|${a.role}|${a.status}`),
    );
  });
});

describe('persona', () => {
  it('has every bullet verbatim in the CV text, so each one can be highlighted', () => {
    for (const role of ROLES) for (const b of role.bullets) expect(CV_TEXT).toContain(b);
  });
});

/** The catalogue the pro package prints, built from the persona. */
function catalogue(): string {
  return ROLES.map((role, r) =>
    [
      `ROLE R${r + 1} — ${role.roleTitle} at ${role.employer} (${role.dates})`,
      ...role.bullets.map((b, i) => `  R${r + 1}.B${i + 1}: ${b}`),
      '',
    ].join('\n'),
  ).join('\n');
}

const JD = [
  'Senior Frontend Engineer',
  '',
  "What we're looking for",
  '• Deep experience with React and TypeScript.',
  '• Experience with testing frontend code, including end to end tests with Playwright or Cypress.',
  '• Strong knowledge of accessibility and WCAG.',
].join('\n');

describe('demoTailorAnswer', () => {
  const prompt = [
    'Target: Senior Frontend Engineer at Stripe',
    'At most 3 bullets per role.',
    '',
    'JOB DESCRIPTION',
    JD,
    '',
    'CATALOGUE',
    catalogue(),
  ].join('\n');

  it('selects only catalogue ids, within the per-role limit, most recent role first', () => {
    const answer = demoTailorAnswer(prompt) as {
      experience: { roleFactId: string; bullets: { factId: string; jdQuote?: string }[] }[];
      reasoning: string;
    };
    const ids = new Set(parseCatalogue(catalogue()).flatMap((r) => r.bullets.map((b) => b.id)));
    expect(answer.experience[0]?.roleFactId).toBe('R1');
    for (const role of answer.experience) {
      expect(role.bullets.length).toBeLessThanOrEqual(3);
      for (const b of role.bullets) {
        expect(ids.has(b.factId)).toBe(true);
        expect(b.factId.startsWith(`${role.roleFactId}.`)).toBe(true);
      }
    }
    expect(answer.reasoning.length).toBeGreaterThan(10);
  });

  it('picks the bullets that share the posting vocabulary and quotes the posting verbatim', () => {
    const answer = demoTailorAnswer(prompt) as {
      experience: { roleFactId: string; bullets: { factId: string; jdQuote?: string }[] }[];
    };
    const r1 = answer.experience[0]?.bullets.map((b) => b.factId) ?? [];
    expect(r1).toContain('R1.B1'); // React and TypeScript
    expect(r1).toContain('R1.B4'); // Playwright end to end tests
    for (const b of answer.experience.flatMap((r) => r.bullets)) {
      if (b.jdQuote) expect(JD).toContain(b.jdQuote);
    }
  });
});

describe('demoDraftAnswer', () => {
  it('cites a catalogue id in every sentence and adds no numbers of its own', () => {
    const prompt = [
      'QUESTION: Tell us about a project you are proud of.',
      'APPLYING FOR: Senior Frontend Engineer at Stripe',
      'LENGTH: about 120 words.',
      '',
      'JOB DESCRIPTION',
      JD,
      '',
      'CATALOGUE',
      catalogue(),
    ].join('\n');
    const answer = demoDraftAnswer(prompt) as {
      sentences: { text: string; sources: string[]; jdQuote?: string }[];
    };
    expect(answer.sentences.length).toBeGreaterThanOrEqual(3);
    for (const s of answer.sentences) {
      expect(s.sources.length > 0 || Boolean(s.jdQuote)).toBe(true);
      if (s.jdQuote) expect(JD).toContain(s.jdQuote);
    }
    expect(answer.sentences.at(-1)?.text).toContain('Senior Frontend Engineer role at Stripe');
  });
});

describe('demoExtract', () => {
  it('reads the company from a board URL and the role from the page', () => {
    const job = demoExtract(
      'Senior Frontend Engineer\nBerlin, Germany\nWe are looking for someone who loves React.',
      'https://jobs.lever.co/acme-labs/1234',
    );
    expect(job).toMatchObject({
      company: 'Acme Labs',
      role: 'Senior Frontend Engineer',
      location: 'Berlin, Germany',
    });
  });

  it('falls back to the host name when the URL is a careers page', () => {
    const job = demoExtract('Product Designer\nRemote', 'https://careers.northwind.com/jobs/42');
    expect(job.company).toBe('Northwind');
    expect(job.role).toBe('Product Designer');
    expect(job.location).toBe('Remote');
  });
});
