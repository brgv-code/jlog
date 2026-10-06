/**
 * The model a demo account talks to.
 *
 * A demo has no API key, and a live demo in front of a room cannot wait on a
 * provider or fail on a rate limit. So demo accounts get this instead: a
 * deterministic stand-in that reads the same prompts a real model gets and
 * answers in the same JSON shapes.
 *
 * It replaces only the model. The prompts are still built by the real pro
 * package, and every answer still goes through the real checks: the render
 * gate resolves each fact id, quotes are looked up in the posting, and drafted
 * sentences are checked for numbers and employers. A wrong answer here fails
 * exactly the way a wrong answer from a provider would.
 *
 * The selection is keyword overlap between each catalogue line and the job
 * description. Crude next to a model, and plenty for a demo: the bullets that
 * share the posting's vocabulary are the ones a reader expects to see picked.
 */

/** Wait this long before answering, so the loading states read as real work. */
export const DEMO_LATENCY_MS = { tailor: 1400, draft: 900, extract: 500 } as const;

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const STOPWORDS = new Set(
  `a about above after again all also am an and any are as at be been being both but by can could did do does doing during each few for from further had has have having her here hers him his how i if in into is it its just me more most my no nor not now of off on once only or other our out over own same she should so some such than that the their them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours
  able across ago day every first help join just like looking make new one role team teams things two use used using want way well work working year years`.split(
    /\s+/,
  ),
);

/** Words worth matching on, with plurals folded so "tests" meets "test". */
export function keywords(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().match(/[a-z][a-z0-9+#.]*[a-z0-9+#]|[a-z]/g) ?? []) {
    const word = raw.replace(/\.$/, '');
    if (word.length < 3 || STOPWORDS.has(word)) continue;
    out.add(
      word.length > 4 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word,
    );
  }
  return out;
}

function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const word of a) if (b.has(word)) n++;
  return n;
}

type Bullet = { id: string; text: string; variants: { id: string; text: string }[] };
type Role = { id: string; title: string; bullets: Bullet[] };

/** The catalogue both pro prompts print, read back into structure. */
export function parseCatalogue(text: string): Role[] {
  const roles: Role[] = [];
  for (const line of text.split('\n')) {
    const role = line.match(/^ROLE (R\d+) — (.*)$/);
    if (role) {
      roles.push({ id: role[1] as string, title: role[2] as string, bullets: [] });
      continue;
    }
    const variant = line.match(/^ {4}(R\d+\.B\d+\.V\d+): (.*)$/);
    if (variant) {
      roles
        .at(-1)
        ?.bullets.at(-1)
        ?.variants.push({
          id: variant[1] as string,
          text: variant[2] as string,
        });
      continue;
    }
    const bullet = line.match(/^ {2}(R\d+\.B\d+): (.*)$/);
    if (bullet) {
      roles.at(-1)?.bullets.push({
        id: bullet[1] as string,
        text: bullet[2] as string,
        variants: [],
      });
    }
  }
  return roles;
}

/** The text between two headings of a prompt, or after the first if the second is absent. */
function section(prompt: string, from: string, to: string | null): string {
  const start = prompt.indexOf(`${from}\n`);
  if (start === -1) return '';
  const body = prompt.slice(start + from.length + 1);
  if (!to) return body;
  const end = body.lastIndexOf(`\n${to}\n`);
  return end === -1 ? body : body.slice(0, end);
}

/**
 * The posting's own lines, cleaned of bullet glyphs, each a candidate quote.
 * Long paragraphs are split into sentences so a quote is one requirement and
 * not a block of text.
 */
function postingLines(jd: string): string[] {
  return jd
    .split('\n')
    .map((l) => l.replace(/^\s*[•●▪‣◦·*+–—-]\s+/, '').trim())
    .flatMap((l) => (l.length > 220 ? l.split(/(?<=[.!?])\s+/) : [l]))
    .filter((l) => l.length >= 24 && !/:$/.test(l));
}

/** The line of the posting that best matches some text, if any line shares enough with it. */
function bestQuote(lines: string[], text: string, min = 2): string | undefined {
  const words = keywords(text);
  let best: { line: string; score: number } | undefined;
  for (const line of lines) {
    const score = overlap(words, keywords(line));
    if (score >= min && (!best || score > best.score)) best = { line, score };
  }
  return best?.line;
}

/**
 * The skills a reasoning line may name. Raw word counts surface whatever the
 * posting repeats ("layer", "incident"); a short list of things a person would
 * actually say they optimised for keeps the sentence sounding like a reason.
 */
const THEMES: Record<string, string> = {
  react: 'React',
  typescript: 'TypeScript',
  playwright: 'Playwright',
  test: 'testing',
  accessibility: 'accessibility',
  wcag: 'accessibility',
  performance: 'performance',
  storybook: 'design system',
  component: 'design system',
  graphql: 'GraphQL',
  'node.js': 'Node.js',
  postgresql: 'PostgreSQL',
  native: 'React Native',
  mobile: 'mobile',
  booking: 'booking flows',
  experiment: 'experimentation',
  flag: 'feature flag',
  payment: 'payments',
  payout: 'payments',
  reconciliation: 'payments',
  api: 'API design',
  release: 'release tooling',
  mentoring: 'mentoring',
  mentored: 'mentoring',
};

/** What the picked bullets and the posting have most in common, in words a person would use. */
function themes(jd: Set<string>, picked: string[]): string[] {
  // Matched by theme rather than by word, so "mentored" on the CV meets
  // "mentoring" in the posting.
  const wanted = new Set([...jd].map((w) => THEMES[w]).filter(Boolean));
  const counts = new Map<string, number>();
  for (const text of picked) {
    const seen = new Set<string>();
    for (const word of keywords(text)) {
      const theme = THEMES[word];
      if (!theme || !wanted.has(theme) || seen.has(theme)) continue;
      seen.add(theme);
      counts.set(theme, (counts.get(theme) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([theme]) => theme);
}

function listOf(words: string[]): string {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
}

/**
 * Answers the tailoring agent's prompt (`tailor-cv-attempt-N`): a selection
 * of catalogue ids, most relevant first, with the posting line each answers.
 */
export function demoTailorAnswer(user: string): unknown {
  const max = Number(user.match(/At most (\d+) bullets per role/)?.[1] ?? 3);
  const jd = section(user, 'JOB DESCRIPTION', 'CATALOGUE');
  const catalogue = parseCatalogue(section(user, 'CATALOGUE', null));
  const jdWords = keywords(jd);
  const lines = postingLines(jd);
  const picked: string[] = [];

  const experience = catalogue.flatMap((role, roleIndex) => {
    const scored = role.bullets
      .map((bullet) => {
        // A phrasing that matches the posting better than the default wins.
        const options = [{ id: undefined, text: bullet.text }, ...bullet.variants];
        const best = options
          .map((o) => ({ ...o, score: overlap(keywords(o.text), jdWords) }))
          .sort((a, b) => b.score - a.score)[0] ?? { id: undefined, text: bullet.text, score: 0 };
        return { bullet, ...best };
      })
      .sort((a, b) => b.score - a.score);

    // The two most recent roles always appear: a CV that skips the current
    // job reads as a gap. Older roles only when they have something to say.
    const keep = roleIndex < 2 ? max : roleIndex === 2 ? Math.min(2, max) : 1;
    const chosen = scored.filter((s, i) => i < keep && (roleIndex < 2 || s.score >= 2));
    if (!chosen.length) return [];

    return [
      {
        roleFactId: role.id,
        bullets: chosen.map((s) => {
          picked.push(s.text);
          const quote = bestQuote(lines, s.text);
          return {
            factId: s.bullet.id,
            ...(s.id ? { variantId: s.id } : {}),
            ...(quote ? { jdQuote: quote } : {}),
          };
        }),
      },
    ];
  });

  const focus = themes(jdWords, picked);
  return {
    experience,
    reasoning: focus.length
      ? `Led with the ${listOf(focus)} work this posting asks for most, and kept older roles to the lines that still match.`
      : 'Kept the most recent, most concrete work and trimmed older roles.',
  };
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * Answers the drafting prompt (`draft-answer-attempt-N`): two or three
 * sentences, each made of a stored bullet and citing it, so the number and
 * employer checks pass because nothing was added to what the bullet says.
 */
export function demoDraftAnswer(user: string): unknown {
  const question = user.match(/^QUESTION: (.*)$/m)?.[1] ?? '';
  const target = user.match(/^APPLYING FOR: (.*)$/m)?.[1] ?? '';
  const rawJd = section(user, 'JOB DESCRIPTION', 'CATALOGUE').trim();
  const jd = rawJd === '(none provided)' ? '' : rawJd;
  const catalogue = parseCatalogue(section(user, 'CATALOGUE', null));
  const want = keywords(`${question} ${question} ${jd}`);

  const candidates = catalogue.flatMap((role) => {
    const employer = role.title.match(/ at (.*?) \(/)?.[1]?.trim() ?? '';
    return role.bullets.map((b) => ({
      id: b.id,
      roleId: role.id,
      employer,
      text: b.text,
      score: overlap(keywords(b.text), want),
    }));
  });
  if (!candidates.length) {
    return {
      insufficient: true,
      missing: 'Import your CV so there is experience to draw on.',
    };
  }

  // Two bullets from different roles read as a career; two from one role read
  // as a list.
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const first = sorted[0] as (typeof sorted)[number];
  const second = sorted.find((c) => c.roleId !== first.roleId) ?? sorted[1];

  const sentences: { text: string; sources: string[]; jdQuote?: string }[] = [];
  const opener = jd ? bestQuote(postingLines(jd), `${question} ${first.text}`, 2) : undefined;
  if (opener) {
    sentences.push({
      text: 'This role asks for the kind of work I have enjoyed most so far.',
      sources: [],
      jdQuote: opener,
    });
  }
  for (const c of [first, second]) {
    if (!c) continue;
    const body = lowerFirst(c.text).replace(/\.$/, '');
    sentences.push({
      text: c.employer ? `At ${c.employer}, I ${body}.` : `I ${body}.`,
      sources: [c.id],
    });
  }
  // Digits stripped: the number check would otherwise reject "Engineer II" as
  // an invented figure, since no cited fact says it.
  const [targetRole, targetCompany] = target.replace(/\d+/g, '').trim().split(' at ');
  const destination =
    targetRole && targetCompany
      ? `the ${targetRole.trim()} role at ${targetCompany.trim()}`
      : targetRole?.trim() || 'this team';
  sentences.push({
    text: `I would like to bring that same care to ${destination}.`,
    sources: [first.roleId],
  });

  return { sentences };
}

/**
 * The single entry point the API hands the pro package in place of a
 * provider. The request name says which prompt it is.
 */
export async function demoJsonCaller(req: { name: string; user: string }): Promise<unknown> {
  if (req.name.startsWith('draft-answer')) {
    await sleep(DEMO_LATENCY_MS.draft);
    return demoDraftAnswer(req.user);
  }
  if (req.name.startsWith('tailor-cv')) {
    await sleep(DEMO_LATENCY_MS.tailor);
    return demoTailorAnswer(req.user);
  }
  // Anything else (a CV structure read, say) has no demo answer. Throwing makes
  // the caller fall back the way it would for a provider that failed.
  throw new Error('The demo model does not answer this request.');
}

const BOARD_COMPANY: [RegExp, number][] = [
  [/boards(?:\.eu)?\.greenhouse\.io\/(?:embed\/job_app\?for=)?([^/?#]+)/, 1],
  [/job-boards(?:\.eu)?\.greenhouse\.io\/([^/?#]+)/, 1],
  [/jobs\.lever\.co\/([^/?#]+)/, 1],
  [/jobs\.ashbyhq\.com\/([^/?#]+)/, 1],
  [/([^/.]+)\.wd\d+\.myworkdayjobs\.com/, 1],
  [/([^/.]+)\.jobs\.personio\.(?:de|com)/, 1],
  [/apply\.workable\.com\/([^/?#]+)/, 1],
  [/ycombinator\.com\/companies\/([^/?#]+)/, 1],
  [/wellfound\.com\/company\/([^/?#]+)/, 1],
];

const ROLE_WORDS =
  /\b(engineer|developer|designer|manager|scientist|analyst|architect|lead|director|specialist|consultant|researcher|recruiter|marketer|writer|administrator|officer|intern|head of|vp)\b/i;

const LOCATION =
  /\b([Rr]emote(?:\s*[-–—(]\s*[A-Za-z ]+\)?)?|[Hh]ybrid|[Oo]n-?site|(?:[A-Z][a-zà-ü]+(?: [A-Z][a-zà-ü]+)?),\s*(?:[A-Z]{2}|[A-Z][a-z]+(?: [A-Z][a-z]+)?))\b/;

const titleCase = (slug: string) =>
  slug
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

/**
 * What `/api/extract` returns for a demo account: company, role and location
 * read off the page by pattern rather than by a model.
 *
 * The extension only calls extract on boards it has no dedicated reader for,
 * so this sees arbitrary career pages. It looks for the company in the URL
 * first, where job boards put it, then in a "Company: X" / "at X" line, and
 * takes the role from the first line that reads like a job title.
 */
export function demoExtract(
  text: string,
  url?: string,
): { company: string; role: string; location: string | null; confidence: number } {
  const lines = text
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 80);

  let company = '';
  if (url) {
    for (const [pattern, group] of BOARD_COMPANY) {
      const m = url.match(pattern);
      if (m?.[group]) {
        company = titleCase(decodeURIComponent(m[group] as string));
        break;
      }
    }
  }
  if (!company) {
    for (const line of lines) {
      const m =
        line.match(/^(?:company|employer|organi[sz]ation)\s*[:·|-]\s*(.{2,60})$/i) ??
        line.match(/\b(?:at|@|join)\s+([A-Z][\w&.'-]*(?: [A-Z][\w&.'-]*){0,3})\b/);
      if (m?.[1]) {
        company = m[1].trim();
        break;
      }
    }
  }
  if (!company && url) {
    try {
      const host = new URL(url).hostname.replace(/^(www|jobs|careers|apply)\./, '');
      company = titleCase(host.split('.')[0] ?? '');
    } catch {
      // An unparseable URL just means no company from it.
    }
  }

  const role =
    lines
      .find((l) => l.length <= 90 && ROLE_WORDS.test(l) && !/[.!?]$/.test(l))
      ?.replace(/\s*[|·–—-]\s*.*$/, '') ?? '';

  const locationLine = lines.find((l) => l.length <= 80 && LOCATION.test(l));
  const location = locationLine?.match(LOCATION)?.[0]?.trim() ?? null;

  return {
    company,
    role,
    location,
    confidence: company && role ? 0.82 : 0.4,
  };
}
