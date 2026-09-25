/**
 * The design system, rendered from itself.
 *
 * Every value on this page is read out of the live stylesheet with
 * `getComputedStyle` rather than typed in here. That is the whole point: a
 * design system page that restates its tokens is a second source of truth, and
 * the second one is always the one that goes stale. Change `tokens.css` and
 * this page changes with it; delete a token and it shows up here as missing.
 *
 * The prose — why a rule exists, when to reach for an animation — is authored,
 * because that part genuinely lives nowhere else. It is kept in step with
 * `apps/web/DESIGN.md`, which stays the file you edit while writing a component.
 */
import { useCallback, useEffect, useState } from 'react';
import { Badge } from './ui/Badge';
import { JlogMark } from './ui/JlogMark';

// ---------------------------------------------------------------------------
// Reading the live stylesheet
// ---------------------------------------------------------------------------

/**
 * Reads a custom property off the live document — but only once mounted.
 *
 * The gate buys two things that looked like they were in tension. The page is
 * server-rendered, so the rules and the motion catalogue sit in the static HTML
 * and a reader without JavaScript — a person, or a model fetching the URL —
 * still gets the substance. And because the reader answers empty on the server
 * *and* on the first client render, both produce identical markup, so there is
 * no hydration mismatch. Values arrive a render later, once `mounted` flips.
 *
 * An earlier version skipped SSR entirely to dodge the mismatch, which fixed
 * hydration by deleting the content.
 */
function useTokenReader(mounted: boolean): (name: string) => string {
  return useCallback(
    (name: string) => {
      if (!mounted || typeof window === 'undefined') return '';
      return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    },
    [mounted],
  );
}

/**
 * Every token's value under one theme, without disturbing what the reader is
 * looking at: the attribute is flipped, read synchronously, and put back before
 * the browser gets a chance to paint.
 */
function readUnderTheme(theme: 'light' | 'dark', names: string[]): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const root = document.documentElement;
  const previous = root.getAttribute('data-theme');
  root.setAttribute('data-theme', theme);
  const computed = getComputedStyle(root);
  const out: Record<string, string> = {};
  for (const n of names) out[n] = computed.getPropertyValue(n).trim();
  if (previous === null) root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', previous);
  return out;
}

// ---------------------------------------------------------------------------
// The catalogue. Names + why, never values.
// ---------------------------------------------------------------------------

const NEUTRALS: [string, string][] = [
  ['--color-bg', 'Content. The page itself.'],
  ['--color-surface', 'Chrome. A step away from content, never a shadow away.'],
  ['--color-surface-raised', 'A panel inside chrome.'],
  ['--color-surface-hover', 'Hover wash. Alpha, so it works over either ground.'],
  ['--color-border', 'The hairline. This is what depth is made of here.'],
  ['--color-border-strong', 'A border that needs to be seen, not felt.'],
];

const TEXT: [string, string][] = [
  ['--color-text-primary', 'What you are reading.'],
  ['--color-text-secondary', 'Supporting. Labels, meta, help text.'],
  ['--color-text-tertiary', 'Present but recessive. Placeholders, timestamps.'],
];

const INTENT: [string, string][] = [
  ['--color-primary', 'The one primary action on a screen. Black, not blue.'],
  ['--color-accent', 'Links, focus rings, selection. Never a button background.'],
  ['--color-success', 'Confirmation ink.'],
  ['--color-warning', 'Caution ink.'],
  ['--color-danger', 'Destructive ink.'],
];

const STATUS: [string, string, string][] = [
  ['--color-status-saved', 'saved', 'Kept, not yet applied to.'],
  ['--color-status-applied', 'applied', 'Sent, waiting.'],
  ['--color-status-interviewing', 'interviewing', 'Burnt amber — yellow is unreadable on white.'],
  ['--color-status-offer', 'offer', 'The outcome the product exists for.'],
  ['--color-status-rejected', 'rejected', 'Closed, not your fault.'],
  ['--color-status-withdrawn', 'withdrawn', 'Closed, your call.'],
];

const ICONS: [string, string][] = [
  ['--color-icon-home', 'Home'],
  ['--color-icon-applications', 'Applications'],
  ['--color-icon-cv', 'CV'],
  ['--color-icon-settings', 'Settings'],
];

const TYPE_SCALE = [
  '--text-xs',
  '--text-sm',
  '--text-base',
  '--text-lg',
  '--text-xl',
  '--text-2xl',
  '--text-3xl',
  '--text-4xl',
];

const SPACE_SCALE = [
  '--space-1',
  '--space-2',
  '--space-3',
  '--space-4',
  '--space-5',
  '--space-6',
  '--space-8',
  '--space-10',
  '--space-12',
  '--space-16',
];

const RADII = ['--radius-sm', '--radius-md', '--radius-lg', '--radius-xl', '--radius-full'];
const SHADOWS: [string, string][] = [
  ['--shadow-sm', 'Barely there. Almost never the right answer.'],
  ['--shadow-md', 'A popover.'],
  ['--shadow-lg', 'A dialog — the only thing that genuinely floats.'],
];

const RULES: [string, string][] = [
  [
    'Space before ornament',
    'A screen that feels wrong needs padding, not a card. This is the rule that settles most arguments.',
  ],
  [
    'Dividers, not boxes',
    'Depth is a 1px border. Shadows belong only to things that genuinely float — popovers and dialogs — and only via --shadow-*.',
  ],
  [
    'Empty states are one formula',
    'Glyph, "No X yet", one line on why the thing exists, exactly one action. An empty result is not an empty account: say "No matching applications" when a filter is on.',
  ],
  [
    'Render the shell before the data',
    'Labels, columns and units appear at zero rows. The page should be legible before it is populated.',
  ],
  [
    'Mono means "a value you copy"',
    'IDs, tokens, emails, model names, file names. Never body text.',
  ],
  [
    'One focus ring',
    'Defined once in tokens.css on :focus-visible. Keyboard navigation is first class in a tool used daily.',
  ],
  [
    'Colour from var(), never a literal',
    'The one exception is a brand mark that is not ours to restyle — the jlog logo, and the provider logos on the sign-in page. Those are literal on purpose.',
  ],
];

// ---------------------------------------------------------------------------
// Motion catalogue — name, class, when to use, and when not to.
// ---------------------------------------------------------------------------

interface Motion {
  name: string;
  token: string;
  use: string;
  avoid: string;
  /** How the demo is rendered; each replays on demand. */
  kind: 'rise' | 'stagger' | 'shake' | 'attention' | 'settle' | 'burst' | 'think' | 'tip' | 'sweep';
}

const MOTIONS: Motion[] = [
  {
    name: 'Arrival',
    token: '.jlog-rise',
    use: 'Content entering the screen: a row appearing, a panel opening, a result replacing a skeleton.',
    avoid:
      'Anything already on screen that merely changed. Re-animating on every render makes an app feel restless.',
    kind: 'rise',
  },
  {
    name: 'Staggered arrival',
    token: '.jlog-stagger',
    use: 'A list that should arrive as a list rather than as one block.',
    avoid:
      'Long lists. The delay caps at the sixth item on purpose — past that a stagger reads as the page loading slowly.',
    kind: 'stagger',
  },
  {
    name: 'Rejection',
    token: '.jlog-shake',
    use: 'A field or button whose submission was refused. It says "this specific control", which a message elsewhere on the page cannot.',
    avoid: 'Server errors. That is not the control’s fault, and shaking it blames the wrong thing.',
    kind: 'shake',
  },
  {
    name: 'Attention',
    token: '.jlog-attention',
    use: 'A value that changed underneath the reader — a stat that updated, a row that moved status.',
    avoid:
      'Anything that also moves. This exists precisely because the change is usually inside a table someone is reading.',
    kind: 'attention',
  },
  {
    name: 'Status settle',
    token: '.jlog-settle',
    use: 'An application moving from one status to another.',
    avoid: 'Translation of any kind. The pill sits inline in a row, and moving it moves the row.',
    kind: 'settle',
  },
  {
    name: 'Offer',
    token: '.jlog-burst',
    use: 'Reserved for an offer. The one unambiguously good thing that happens here, and the only event celebrated without the user having clicked anything.',
    avoid:
      'Saving a form. Spending this on routine success is what makes it stop meaning anything.',
    kind: 'burst',
  },
  {
    name: 'Thinking',
    token: '<JlogMark mode="think" />',
    use: 'Waits measured in seconds: model work, a page’s first paint while the session is checked.',
    avoid:
      'Quick fetches. A logo on every few-hundred-millisecond request stops reading as care and starts reading as slowness — that is what Spinner is still for.',
    kind: 'think',
  },
  {
    name: 'Hat tip',
    token: '<JlogMark mode="tip" />',
    use: 'A moment worth marking: signing in, a key created, a link sent.',
    avoid:
      'Anything routine. It runs for over a second, which is only affordable when the user was waiting for exactly this.',
    kind: 'tip',
  },
  {
    name: 'Sweep',
    token: '.jlog-sweep',
    use: 'A wait whose shape is already known, paired with skeletons shaped like the result so nothing jumps.',
    avoid:
      'A pulse instead. At the durations real model work takes, a pulse reads as a stalled page.',
    kind: 'sweep',
  },
];

// ---------------------------------------------------------------------------
// Small presentational pieces
// ---------------------------------------------------------------------------

function Section({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 'var(--space-16)' }}>
      <h2
        style={{
          fontSize: 'var(--text-xl)',
          fontWeight: 650,
          letterSpacing: '-0.01em',
          color: 'var(--color-text-primary)',
          marginBottom: intro ? 'var(--space-2)' : 'var(--space-5)',
        }}
      >
        {title}
      </h2>
      {intro && (
        <p
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--color-text-secondary)',
            lineHeight: 1.65,
            maxWidth: '68ch',
            marginBottom: 'var(--space-5)',
          }}
        >
          {intro}
        </p>
      )}
      {children}
    </section>
  );
}

const monoStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-xs)',
  color: 'var(--color-text-secondary)',
};

function Swatch({ name, note, read }: { name: string; note: string; read: (n: string) => string }) {
  const value = read(name);
  return (
    <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
      <div
        style={{
          width: 40,
          height: 40,
          flexShrink: 0,
          borderRadius: 'var(--radius-md)',
          background: `var(${name})`,
          border: '1px solid var(--color-border)',
        }}
      />
      <div style={{ minWidth: 0 }}>
        <div style={monoStyle}>{name}</div>
        <div style={{ ...monoStyle, color: 'var(--color-text-tertiary)' }}>{value || '—'}</div>
        <div
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--color-text-secondary)',
            marginTop: 2,
            lineHeight: 1.5,
          }}
        >
          {note}
        </div>
      </div>
    </div>
  );
}

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
  gap: 'var(--space-5)',
};

// ---------------------------------------------------------------------------
// Motion demos
// ---------------------------------------------------------------------------

function MotionDemo({ motion, nonce }: { motion: Motion; nonce: number }) {
  // `key` on the animated node is what actually replays a CSS animation: React
  // remounts it, and the animation starts from scratch. Toggling a class does
  // not, because the browser sees no change once it has already run.
  const k = `${motion.kind}-${nonce}`;

  const chip: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--space-2) var(--space-3)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-surface)',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-text-secondary)',
  };

  switch (motion.kind) {
    case 'rise':
      return (
        <div key={k} className="jlog-rise" style={chip}>
          Arrived
        </div>
      );
    case 'stagger':
      return (
        <div key={k} className="jlog-stagger" style={{ display: 'grid', gap: 'var(--space-2)' }}>
          {['Staffbase', 'Linear', 'Vercel'].map((c) => (
            <div key={c} style={chip}>
              {c}
            </div>
          ))}
        </div>
      );
    case 'shake':
      return (
        <input
          key={k}
          className="jlog-shake"
          readOnly
          value="not-an-email"
          style={{
            ...chip,
            borderColor: 'var(--color-danger)',
            color: 'var(--color-danger)',
            fontFamily: 'var(--font-mono)',
          }}
        />
      );
    case 'attention':
      return (
        <div
          key={k}
          className="jlog-attention"
          style={{ ...chip, fontVariantNumeric: 'tabular-nums' }}
        >
          31 applications
        </div>
      );
    case 'settle':
      return (
        <div key={k} className="jlog-settle" style={{ display: 'inline-block' }}>
          <Badge tone="var(--color-status-interviewing)">interviewing</Badge>
        </div>
      );
    case 'burst':
      return (
        <div
          key={k}
          style={{ position: 'relative', display: 'inline-flex', padding: 'var(--space-2)' }}
        >
          <span
            className="jlog-burst-ring"
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 'var(--radius-full)',
              border: '2px solid var(--color-status-offer)',
            }}
          />
          <div className="jlog-burst" style={{ display: 'inline-block' }}>
            <Badge tone="var(--color-status-offer)">offer</Badge>
          </div>
        </div>
      );
    case 'think':
      return <JlogMark key={k} mode="think" size={36} />;
    case 'tip':
      return <JlogMark key={k} mode="tip" size={36} />;
    case 'sweep':
      return (
        <div
          key={k}
          style={{
            position: 'relative',
            overflow: 'hidden',
            width: 160,
            height: 12,
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-surface-raised)',
          }}
        >
          <div
            className="jlog-sweep"
            style={{
              position: 'absolute',
              inset: 0,
              transform: 'translateX(-100%)',
              background:
                'linear-gradient(90deg, transparent, var(--color-surface-hover), transparent)',
            }}
          />
        </div>
      );
  }
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

export default function DesignSystem() {
  /*
   * Start from whatever theme is already applied rather than assuming light.
   * Layout.astro resolves the user's stored preference before first paint, so
   * defaulting to 'light' here meant arriving on this page silently flipped a
   * dark user back to light — and left them there after they navigated away.
   */
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  /*
   * False on the server and on the first client render, so the two agree; true
   * from the first effect onward, which is when token values appear.
   */
  const [mounted, setMounted] = useState(false);

  // Adopt whatever theme the page already has, and only after mount: reading it
  // in the initialiser would differ between server and client and reintroduce
  // the mismatch this component just stopped having.
  useEffect(() => {
    setMounted(true);
    if (document.documentElement.getAttribute('data-theme') === 'dark') setTheme('dark');
  }, []);
  const [nonce, setNonce] = useState(0);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const read = useTokenReader(mounted);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  /*
   * The toggle on this page is a preview, not a preference: it must not
   * outlive the page. Whatever the app had applied goes back on the way out.
   */
  useEffect(() => {
    const original = document.documentElement.getAttribute('data-theme');
    return () => {
      if (original === null) document.documentElement.removeAttribute('data-theme');
      else document.documentElement.setAttribute('data-theme', original);
    };
  }, []);

  // Replay every animation on the page at once, so they can be compared
  // against each other rather than one at a time from memory.
  const replayAll = () => setNonce((n) => n + 1);

  /*
   * Built in an effect, not a memo: assembling it flips `data-theme` to read
   * the other theme's values, and a memo runs during render — DOM writes do not
   * belong there even when they are put back synchronously.
   */
  const [spec, setSpec] = useState('');
  useEffect(() => {
    // No theme dependency, and that is now correct rather than a bug: the spec
    // reads both themes explicitly via `readUnderTheme`, and every other scale
    // is theme-independent. An earlier version returned only the current
    // theme's values and memoised them on a reader whose identity never
    // changed, so the copied text silently disagreed with the swatches.
    setSpec(buildSpec(read));
  }, [read]);

  async function copySpec() {
    // Confirming before the write resolves is how a blocked or unavailable
    // clipboard came to report success on an empty clipboard.
    try {
      await navigator.clipboard.writeText(spec);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
    setTimeout(() => setCopyState('idle'), 2400);
  }

  const cardStyle: React.CSSProperties = {
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-lg)',
    padding: 'var(--space-4)',
    background: 'var(--color-bg)',
  };

  return (
    <main
      style={{
        maxWidth: '72rem',
        margin: '0 auto',
        padding: 'var(--space-12) var(--space-6) var(--space-16)',
        fontFamily: 'var(--font-sans)',
        color: 'var(--color-text-primary)',
      }}
    >
      {/* ---- Masthead ---- */}
      <header style={{ marginBottom: 'var(--space-12)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            marginBottom: 'var(--space-4)',
          }}
        >
          <JlogMark size={34} />
          <h1 style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, letterSpacing: '-0.02em' }}>
            jlog design system
          </h1>
        </div>
        <p
          style={{
            fontSize: 'var(--text-base)',
            color: 'var(--color-text-secondary)',
            lineHeight: 1.65,
            maxWidth: '68ch',
          }}
        >
          Everything needed to build a screen that looks like it belongs here. Every value below is
          read out of the live stylesheet at render time rather than written into this page, so it
          cannot drift from <code style={monoStyle}>styles/tokens.css</code>. The prose is kept in
          step with <code style={monoStyle}>apps/web/DESIGN.md</code>, which is the file to keep
          open while editing a component.
        </p>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--space-2)',
            marginTop: 'var(--space-5)',
          }}
        >
          <button
            type="button"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            style={{
              padding: 'var(--space-2) var(--space-4)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
              color: 'var(--color-text-primary)',
              fontSize: 'var(--text-sm)',
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            Viewing {theme} — switch to {theme === 'light' ? 'dark' : 'light'}
          </button>
          <button
            type="button"
            onClick={replayAll}
            style={{
              padding: 'var(--space-2) var(--space-4)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
              color: 'var(--color-text-primary)',
              fontSize: 'var(--text-sm)',
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            Replay all motion
          </button>
          <button
            type="button"
            onClick={() => void copySpec()}
            style={{
              padding: 'var(--space-2) var(--space-4)',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: 'var(--color-primary)',
              color: 'var(--color-primary-fg)',
              fontSize: 'var(--text-sm)',
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            {copyState === 'copied'
              ? 'Copied'
              : copyState === 'failed'
                ? 'Clipboard blocked — select the text below'
                : 'Copy full spec'}
          </button>
        </div>
      </header>

      {/* ---- Rules ---- */}
      <Section
        title="Rules in force"
        intro="Seven rules, in rough order of how often they settle an argument. They are the reason the app looks the way it does; the tokens below are only how they are enforced."
      >
        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          {RULES.map(([name, why], i) => (
            <div key={name} style={{ ...cardStyle, display: 'flex', gap: 'var(--space-4)' }}>
              <span
                style={{
                  ...monoStyle,
                  color: 'var(--color-text-tertiary)',
                  flexShrink: 0,
                  paddingTop: 2,
                }}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <div>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{name}</div>
                <div
                  style={{
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-text-secondary)',
                    lineHeight: 1.6,
                    marginTop: 2,
                  }}
                >
                  {why}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ---- Colour ---- */}
      <Section
        title="Where colour is allowed"
        intro="Greyscale everywhere except two places that mean something: application status, and the nav icons. Primary is black and accent is blue, deliberately — wiring one token to both jobs turns a quiet interface into a blue one, where every button is an advertisement and the accent stops meaning “this is interactive”."
      >
        <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-3)' }}>
          Neutrals — two, not a ramp
        </h3>
        <div style={{ ...gridStyle, marginBottom: 'var(--space-8)' }}>
          {NEUTRALS.map(([n, note]) => (
            <Swatch key={n} name={n} note={note} read={read} />
          ))}
        </div>

        <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-3)' }}>
          Text — three steps, and no fourth
        </h3>
        <div style={{ ...gridStyle, marginBottom: 'var(--space-8)' }}>
          {TEXT.map(([n, note]) => (
            <Swatch key={n} name={n} note={note} read={read} />
          ))}
        </div>

        <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-3)' }}>
          Intent
        </h3>
        <div style={{ ...gridStyle, marginBottom: 'var(--space-8)' }}>
          {INTENT.map(([n, note]) => (
            <Swatch key={n} name={n} note={note} read={read} />
          ))}
        </div>

        <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
          Status — the one flow that earns a palette
        </h3>
        <p
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--color-text-secondary)',
            lineHeight: 1.65,
            maxWidth: '68ch',
            marginBottom: 'var(--space-4)',
          }}
        >
          These are inks, not fills: each renders as text on a 10% wash of itself, so every value
          has to clear 4.5:1 on its own ground. That is why interviewing is a burnt amber rather
          than yellow — yellow cannot be read on white at any weight. Never let one fill a chart
          bar: offer and rejected sit ΔE 4.2 apart under deuteranopia, which is fine on a pill
          carrying its own label and misleading when bar length is the comparison.
        </p>
        <div style={{ ...gridStyle, marginBottom: 'var(--space-8)' }}>
          {STATUS.map(([n, label, note]) => (
            <div
              key={n}
              style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}
            >
              <div style={{ flexShrink: 0 }}>
                <Badge tone={`var(${n})`}>{label}</Badge>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={monoStyle}>{read(n) || '—'}</div>
                <div
                  style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-text-secondary)',
                    marginTop: 2,
                    lineHeight: 1.5,
                  }}
                >
                  {note}
                </div>
              </div>
            </div>
          ))}
        </div>

        <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-3)' }}>
          Nav icons — one hue per destination
        </h3>
        <div style={gridStyle}>
          {ICONS.map(([n, note]) => (
            <Swatch key={n} name={n} note={note} read={read} />
          ))}
        </div>
      </Section>

      {/* ---- Type ---- */}
      <Section
        title="Typography"
        intro="Geist for everything, Geist Mono for values you copy — IDs, tokens, emails, model names, file names. Mono is never body text."
      >
        <div style={{ ...cardStyle, marginBottom: 'var(--space-5)' }}>
          <div style={monoStyle}>--font-sans</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
            {read('--font-sans') || '—'}
          </div>
          <div style={{ ...monoStyle, marginTop: 'var(--space-3)' }}>--font-mono</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
            {read('--font-mono') || '—'}
          </div>
        </div>
        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          {TYPE_SCALE.map((t) => (
            <div key={t} style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-4)' }}>
              <span style={{ ...monoStyle, width: 110, flexShrink: 0 }}>{t}</span>
              <span style={{ ...monoStyle, width: 70, flexShrink: 0 }}>{read(t) || '—'}</span>
              <span style={{ fontSize: `var(${t})`, letterSpacing: '-0.01em' }}>
                Track your job applications
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* ---- Space / radius / shadow ---- */}
      <Section
        title="Space, radius, depth"
        intro="Spacing comes from the scale, always. If the step you want is missing, add it to the scale rather than typing a pixel value — an undefined var() fails silently and the whole declaration is dropped, which is a bug that looks like a design decision."
      >
        <div style={{ display: 'grid', gap: 'var(--space-2)', marginBottom: 'var(--space-8)' }}>
          {SPACE_SCALE.map((s) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
              <span style={{ ...monoStyle, width: 110, flexShrink: 0 }}>{s}</span>
              <span style={{ ...monoStyle, width: 70, flexShrink: 0 }}>{read(s) || '—'}</span>
              <span
                style={{
                  height: 12,
                  width: `var(${s})`,
                  background: 'var(--color-accent)',
                  borderRadius: 2,
                }}
              />
            </div>
          ))}
        </div>

        <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-3)' }}>
          Radius
        </h3>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--space-4)',
            marginBottom: 'var(--space-8)',
          }}
        >
          {RADII.map((r) => (
            <div key={r} style={{ textAlign: 'center' }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: `var(${r})`,
                  background: 'var(--color-surface-raised)',
                  border: '1px solid var(--color-border)',
                  marginBottom: 'var(--space-2)',
                }}
              />
              <div style={monoStyle}>{r.replace('--radius-', '')}</div>
              <div style={{ ...monoStyle, color: 'var(--color-text-tertiary)' }}>
                {read(r) || '—'}
              </div>
            </div>
          ))}
        </div>

        <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-3)' }}>
          Shadow — almost never the answer
        </h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-6)' }}>
          {SHADOWS.map(([s, note]) => (
            <div key={s} style={{ width: 200 }}>
              <div
                style={{
                  height: 64,
                  borderRadius: 'var(--radius-lg)',
                  background: 'var(--color-bg)',
                  boxShadow: `var(${s})`,
                  marginBottom: 'var(--space-2)',
                }}
              />
              <div style={monoStyle}>{s}</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                {note}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ---- Motion ---- */}
      <Section
        title="Motion"
        intro="Motion is spent where it carries meaning and nowhere else. The test for any animation is whether removing it would lose information — that something arrived, that something is still working, that something was rejected, that something finally went right. Anything that only makes the page livelier is ornament, and ornament loses to padding."
      >
        <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-3)' }}>
          Four durations, three easings, and no more
        </h3>
        <div style={{ ...gridStyle, marginBottom: 'var(--space-8)' }}>
          {[
            [
              '--motion-instant',
              'Direct manipulation: hover, press, a colour change under the cursor.',
            ],
            ['--motion-fast', 'Feedback on something you just did.'],
            ['--motion-base', 'Something arriving: a row, a panel, a dialog.'],
            ['--motion-celebrate', 'A moment worth marking. The only budget over half a second.'],
            ['--ease-arrive', 'Fast in, gentle stop. The default for anything entering.'],
            ['--ease-spring', 'Slight overshoot. Celebration only — it draws attention to itself.'],
            [
              '--ease-loop',
              'Symmetric, for anything that repeats. An asymmetric loop develops a limp.',
            ],
          ].map(([t, note]) => (
            <div key={t} style={cardStyle}>
              <div style={monoStyle}>{t}</div>
              <div style={{ ...monoStyle, color: 'var(--color-text-tertiary)' }}>
                {read(t as string) || '—'}
              </div>
              <div
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-text-secondary)',
                  marginTop: 4,
                  lineHeight: 1.5,
                }}
              >
                {note}
              </div>
            </div>
          ))}
        </div>

        <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: 'var(--space-3)' }}>
          The catalogue
        </h3>
        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          {MOTIONS.map((m) => (
            <div
              key={m.name}
              style={{
                ...cardStyle,
                display: 'grid',
                // Collapses to one column on a phone. Pinned side by side the
                // demo column forced the card wider than the screen.
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))',
                gap: 'var(--space-5)',
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 76,
                  background: 'var(--color-surface)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-3)',
                }}
              >
                <MotionDemo motion={m} nonce={nonce} />
              </div>
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 'var(--space-3)',
                    flexWrap: 'wrap',
                  }}
                >
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{m.name}</span>
                  <code style={monoStyle}>{m.token}</code>
                </div>
                <p
                  style={{
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-text-secondary)',
                    lineHeight: 1.6,
                    marginTop: 4,
                  }}
                >
                  {m.use}
                </p>
                <p
                  style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-text-tertiary)',
                    lineHeight: 1.6,
                    marginTop: 4,
                  }}
                >
                  <strong style={{ color: 'var(--color-text-secondary)' }}>Not for:</strong>{' '}
                  {m.avoid}
                </p>
              </div>
            </div>
          ))}
        </div>

        <p
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--color-text-secondary)',
            lineHeight: 1.65,
            maxWidth: '68ch',
            marginTop: 'var(--space-5)',
          }}
        >
          <strong style={{ color: 'var(--color-text-primary)' }}>Reduced motion</strong> is honoured
          for every one of these, and it does not mean “no animation”. Anything that only reports —
          a loader, a sweep — keeps a slow, low-amplitude version, because a loader that does not
          move cannot say work is still happening. Anything that only decorates stops entirely.
        </p>
      </Section>

      {/* ---- For an LLM ---- */}
      <Section
        title="Copying this design"
        intro="The button at the top copies the whole system as plain text — every token with its resolved value in both themes, the rules, and the motion catalogue. It is written to be pasted into a model prompt or a new project’s brief, and it is generated from the live stylesheet at the moment you press it, so it is never a stale snapshot. The block below is that exact text in full, not a preview, so it can still be selected by hand if the clipboard is unavailable."
      >
        <pre
          // Selecting inside this is the fallback when the clipboard is blocked,
          // so it holds the complete spec rather than a truncated preview — and
          // `all` makes one click take the whole thing rather than a paragraph.
          style={{
            ...monoStyle,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-4)',
            overflowX: 'auto',
            maxHeight: 320,
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            userSelect: 'all',
          }}
        >
          {spec}
        </pre>
      </Section>
    </main>
  );
}

// ---------------------------------------------------------------------------
// The copyable spec
// ---------------------------------------------------------------------------

function buildSpec(read: (n: string) => string): string {
  /*
   * Every colour token in the stylesheet, not just the ones with a swatch
   * above. The page offers this as a complete reference, so leaving out chart
   * and citation colours — which a new screen very much needs — made it a
   * reference you could not actually build from.
   */
  const COLOUR_TOKENS = [
    ...NEUTRALS.map(([n]) => n),
    ...TEXT.map(([n]) => n),
    ...INTENT.map(([n]) => n),
    ...STATUS.map(([n]) => n),
    ...ICONS.map(([n]) => n),
    '--color-surface-active',
    '--color-overlay',
    '--color-primary-hover',
    '--color-primary-fg',
    '--color-accent-hover',
    '--color-accent-subtle',
    '--color-danger-bg',
    '--color-danger-border',
    '--color-danger-fg',
    '--color-chart-mark',
    '--color-chart-bar',
    '--color-chart-grid',
    '--color-cite-cv',
    '--color-cite-cv-fill',
    '--color-cite-jd',
    '--color-cite-jd-fill',
    '--color-paper',
    '--color-paper-ink',
  ];

  // Colour is the only thing that differs between themes; the scales do not.
  const light = readUnderTheme('light', COLOUR_TOKENS);
  const dark = readUnderTheme('dark', COLOUR_TOKENS);

  const both = (n: string) => `  ${n}: ${light[n] || '—'}  /* dark: ${dark[n] || '—'} */`;
  const one = (n: string) => `  ${n}: ${read(n) || '—'}`;

  return [
    'jlog design system',
    '==================',
    '',
    'Light by default. White content, off-white chrome, a hairline between them.',
    'Greyscale everywhere except application status and nav icons. The one loud',
    'thing on any screen is a single black button.',
    '',
    'RULES',
    ...RULES.map(([name, why], i) => `${i + 1}. ${name} — ${why}`),
    '',
    'COLOUR (light value, with the dark-theme value beside it)',
    ...COLOUR_TOKENS.map(both),
    '',
    'TYPE',
    `  --font-sans: ${read('--font-sans')}`,
    `  --font-mono: ${read('--font-mono')}`,
    ...TYPE_SCALE.map(one),
    '',
    'SPACE',
    ...SPACE_SCALE.map(one),
    '',
    'RADIUS',
    ...RADII.map(one),
    '',
    'DEPTH',
    ...SHADOWS.map(([n]) => n).map(one),
    '',
    'MOTION',
    ...['--motion-instant', '--motion-fast', '--motion-base', '--motion-celebrate'].map(one),
    ...['--ease-arrive', '--ease-spring', '--ease-loop'].map(one),
    '',
    ...MOTIONS.flatMap((m) => [
      `${m.name} (${m.token})`,
      `  use: ${m.use}`,
      `  not for: ${m.avoid}`,
    ]),
  ].join('\n');
}
