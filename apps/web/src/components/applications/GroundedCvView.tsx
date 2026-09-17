/**
 * The generated CV, next to the document it came out of.
 *
 * Tailoring's promise is that nothing was written from scratch — every line is
 * a fact the owner already stored. The old dialog stated that in a sentence
 * under a list of bullets, which asks the reader to take it on trust, and
 * hovering a bullet produced "pf_3f2a…", which is a guarantee about ids rather
 * than one a person can check.
 *
 * So the claim is shown instead: pick a line on the left and the passage it was
 * read from lights up on the right, in your own CV, with everything around it
 * dimmed and a connector drawn between the two. A line whose source cannot be
 * located says so rather than quietly looking like the rest.
 *
 * The right pane has a second tab for the posting. Those citations come from
 * the model and are only shown when the quote was found in the posting
 * verbatim — see `findQuote` in @jlog/pro.
 */
import {
  AlertTriangleIcon,
  CheckIcon,
  DownloadIcon,
  FileTextIcon,
  LinkIcon,
  SparklesIcon,
  UnlinkIcon,
} from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CvDocument, CvSpan } from '../../lib/cvSource';
import { Button } from '../ui/button';

type SelectedBullet = {
  factId: string;
  variantId?: string;
  text: string;
  jd?: { text: string; start: number; end: number };
};

export type SelectedRole = {
  roleFactId: string;
  employer: string | null;
  roleTitle: string | null;
  dates: string | null;
  bullets: SelectedBullet[];
};

interface Props {
  company: string;
  role: string;
  jobDescription: string;
  selected: SelectedRole[];
  cv: CvDocument;
  reasoning?: string;
  attempts: number;
  onRegenerate: () => void;
  onDownload: () => void;
  onCopyTex: () => void;
  regenerating: boolean;
  downloading: boolean;
  copied: boolean;
  /** A failure that happened with this result already on screen. */
  notice?: string | null;
  onDismissNotice?: () => void;
}

type Tab = 'cv' | 'jd';

/**
 * How firmly a generated line is tied to the imported CV.
 *
 * There is deliberately no "unsupported" here, and there cannot be: the agent
 * selects fact ids and the renderer resolves every one of them, so a line that
 * came from nowhere has no way to exist. What varies is how well the fact can
 * be pointed at in the document — which is a different, smaller claim, and
 * saying so precisely is the point of the whole screen.
 */
type Grounding = 'verbatim' | 'phrasing' | 'unlocated';

const GROUNDING: Record<Grounding, { label: string; note: string; className: string }> = {
  verbatim: {
    label: 'From your CV',
    note: 'These are the words in your CV, selected for this posting.',
    className: 'bg-[var(--color-cite-cv-fill)] text-[var(--color-cite-cv)]',
  },
  phrasing: {
    label: 'Your phrasing',
    note: 'A wording you wrote for an earlier application, standing in for the same fact. The highlighted line is that fact in your CV.',
    className: 'bg-primary/15 text-primary',
  },
  unlocated: {
    label: 'No line to point at',
    note: 'This fact is in your profile but is not in the CV you imported — it came from an earlier import or was seeded directly. The claim still comes from you; there is just nothing here to highlight.',
    className: 'bg-muted text-muted-foreground',
  },
};

type Claim = {
  key: string;
  roleIndex: number;
  text: string;
  factId: string;
  variantId?: string;
  cvSpan: CvSpan | null;
  jd: SelectedBullet['jd'];
  grounding: Grounding;
};

function buildClaims(selected: SelectedRole[], cv: CvDocument): Claim[] {
  return selected.flatMap((role, roleIndex) =>
    role.bullets.map((bullet, i) => {
      const cvSpan = cv.spans[bullet.factId] ?? null;
      return {
        key: `${bullet.factId}:${bullet.variantId ?? ''}:${roleIndex}:${i}`,
        roleIndex,
        text: bullet.text,
        factId: bullet.factId,
        ...(bullet.variantId ? { variantId: bullet.variantId } : {}),
        cvSpan,
        jd: bullet.jd,
        grounding: !cvSpan ? 'unlocated' : bullet.variantId ? 'phrasing' : 'verbatim',
      } satisfies Claim;
    }),
  );
}

/**
 * The passage, with everything else dimmed.
 *
 * The document is rendered as one pre-wrapped string in three pieces rather
 * than parsed into blocks: a CV pulled out of a PDF has no structure to parse,
 * and inventing one would mean showing something other than what was imported.
 * Character offsets slice it exactly.
 */
function Paper({
  text,
  span,
  markRef,
  empty,
}: {
  text: string;
  span: CvSpan | null;
  markRef: React.RefObject<HTMLElement>;
  empty: string;
}) {
  if (!text.trim()) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center px-8 text-center text-[13px]">
        {empty}
      </div>
    );
  }

  const dim = span ? 'opacity-40 transition-opacity' : 'transition-opacity';
  const before = span ? text.slice(0, span[0]) : text;
  const hit = span ? text.slice(span[0], span[1]) : '';
  const after = span ? text.slice(span[1]) : '';

  return (
    <article className="mx-auto w-full max-w-[660px] whitespace-pre-wrap break-words rounded-sm border border-border/60 bg-[var(--color-paper)] px-8 py-9 text-[12.5px] leading-[1.65] text-[var(--color-paper-ink)] shadow-[0_1px_2px_rgba(0,0,0,.25),0_16px_40px_rgba(0,0,0,.35)]">
      <span className={dim}>{before}</span>
      {span && (
        <mark
          ref={markRef as React.RefObject<HTMLElement>}
          // Cloned decoration so a passage that wraps is boxed line by line
          // rather than as one ragged rectangle spanning the gap.
          className="rounded-[3px] bg-[color:var(--cite-fill)] px-[3px] py-[1px] text-inherit shadow-[0_0_0_1px_var(--cite)] [box-decoration-break:clone] [-webkit-box-decoration-break:clone]"
        >
          {hit}
        </mark>
      )}
      <span className={dim}>{after}</span>
    </article>
  );
}

export function GroundedCvView({
  company,
  role,
  jobDescription,
  selected,
  cv,
  reasoning,
  attempts,
  onRegenerate,
  onDownload,
  onCopyTex,
  regenerating,
  downloading,
  copied,
  notice,
  onDismissNotice,
}: Props) {
  const [sel, setSel] = useState(0);
  const [tab, setTab] = useState<Tab>('cv');
  const [arrow, setArrow] = useState<{
    d: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);
  const [stub, setStub] = useState<{ x: number; y: number } | null>(null);

  const bodyRef = useRef<HTMLDivElement>(null);
  const claimsRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLElement>(null);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const claims = buildClaims(selected, cv);
  const claim = claims[sel];
  const located = claims.filter((c) => c.cvSpan).length;

  const span: CvSpan | null =
    tab === 'cv' ? (claim?.cvSpan ?? null) : claim?.jd ? [claim.jd.start, claim.jd.end] : null;
  const docText = tab === 'cv' ? cv.text : jobDescription;
  const accent = tab === 'cv' ? 'var(--color-cite-cv)' : 'var(--color-cite-jd)';
  const fill = tab === 'cv' ? 'var(--color-cite-cv-fill)' : 'var(--color-cite-jd-fill)';

  /**
   * The connector is measured off the live DOM rather than laid out in CSS, so
   * it keeps pointing at the passage while either side is scrolled, and does
   * not have to be re-derived when the panes resize. The endpoint is clamped to
   * the viewer's edges: a passage scrolled out of sight still gets an arrow
   * saying which way it went.
   */
  const draw = useCallback(() => {
    const body = bodyRef.current;
    const row = rowRefs.current[sel];
    if (!body || !row) return;

    const box = body.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    const x1 = r.right - box.left;
    const y1 = r.top + r.height / 2 - box.top;

    const mark = markRef.current;
    const viewer = viewerRef.current;
    if (!mark || !viewer) {
      setArrow(null);
      setStub({ x: x1, y: y1 });
      return;
    }

    const m = mark.getBoundingClientRect();
    const v = viewer.getBoundingClientRect();
    const clamped = Math.min(Math.max(m.top + m.height / 2, v.top + 10), v.bottom - 10);
    const x2 = m.left - box.left - 6;
    const y2 = clamped - box.top;

    setStub(null);
    setArrow({
      d: `M ${x1} ${y1} C ${x1 + 90} ${y1}, ${x2 - 90} ${y2}, ${x2} ${y2}`,
      x1,
      y1,
      x2,
      y2,
    });
  }, [sel]);

  // Layout has to settle before the passage can be measured, and the scroll it
  // triggers is what most of the redraws below are chasing.
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [draw]);

  useEffect(() => {
    markRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, []);

  useEffect(() => {
    let frame = 0;
    const redraw = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(draw);
    };
    const claimsEl = claimsRef.current;
    const viewerEl = viewerRef.current;
    claimsEl?.addEventListener('scroll', redraw, { passive: true });
    viewerEl?.addEventListener('scroll', redraw, { passive: true });
    window.addEventListener('resize', redraw);
    return () => {
      cancelAnimationFrame(frame);
      claimsEl?.removeEventListener('scroll', redraw);
      viewerEl?.removeEventListener('scroll', redraw);
      window.removeEventListener('resize', redraw);
    };
  }, [draw]);

  /** Selecting brings the passage into view; the arrow follows the scroll. */
  function select(index: number) {
    setSel(index);
    requestAnimationFrame(() =>
      markRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }),
    );
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const next = e.key === 'ArrowDown' ? sel + 1 : sel - 1;
    if (next < 0 || next >= claims.length) return;
    select(next);
    rowRefs.current[next]?.focus();
  }

  const ground = claim ? GROUNDING[claim.grounding] : null;

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      style={{ '--cite': accent, '--cite-fill': fill } as React.CSSProperties}
    >
      {/* Top bar: what this is, how well it is grounded, and what to do with it. */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-5 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium">
            {role} <span className="text-muted-foreground">at {company}</span>
          </p>
          <p className="text-muted-foreground mt-0.5 text-[12px]">
            {claims.length} line{claims.length === 1 ? '' : 's'}, every one selected from your
            stored facts
            {located < claims.length ? ` · ${located} traceable to your imported CV` : ''}
            {attempts > 1 ? ` · settled on attempt ${attempts}` : ''}
          </p>
        </div>
        {notice && (
          <button
            type="button"
            onClick={onDismissNotice}
            className="border-destructive/30 bg-destructive/10 text-destructive order-last flex items-center gap-2 rounded-md border px-3 py-1.5 text-[12px] lg:order-none"
          >
            <AlertTriangleIcon className="size-3.5" />
            {notice}
          </button>
        )}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onCopyTex}>
            {copied ? <CheckIcon /> : null}
            {copied ? 'Copied' : 'Copy LaTeX'}
          </Button>
          <Button variant="outline" size="sm" onClick={onRegenerate} disabled={regenerating}>
            <SparklesIcon /> Regenerate
          </Button>
          <Button size="sm" onClick={onDownload} disabled={downloading}>
            <DownloadIcon /> {downloading ? 'Compiling…' : 'Download PDF'}
          </Button>
        </div>
      </header>

      <div
        ref={bodyRef}
        className="relative grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_88px_minmax(0,1.05fr)]"
      >
        {/* Left: the generated CV, one selectable line per claim. */}
        <section
          ref={claimsRef}
          aria-label="Generated CV"
          className="min-h-0 overflow-y-auto border-b border-border px-5 py-4 lg:border-b-0 lg:border-r"
          onKeyDown={onKeyDown}
        >
          {reasoning && (
            <p className="text-muted-foreground mb-4 border-l-2 border-primary/40 pl-3 text-[12.5px] leading-relaxed italic">
              {reasoning}
            </p>
          )}

          {selected.map((r, roleIndex) => (
            <div key={r.roleFactId} className="mb-5">
              <div className="mb-2 flex items-baseline gap-2.5 px-1">
                <span className="text-muted-foreground font-mono text-[10.5px] tabular-nums">
                  {r.dates}
                </span>
                <span className="text-[12.5px] font-medium">{r.roleTitle}</span>
                <span className="text-muted-foreground text-[12.5px]">{r.employer}</span>
              </div>

              {claims.map((c, i) => {
                if (c.roleIndex !== roleIndex) return null;
                // The accent is a promise that something is highlighted, so it
                // follows the tab being shown: a line with no passage in the
                // open document gets the neutral treatment, not a teal border
                // pointing at nothing.
                const linked = tab === 'cv' ? Boolean(c.cvSpan) : Boolean(c.jd);
                return (
                  <button
                    key={c.key}
                    ref={(el) => {
                      rowRefs.current[i] = el;
                    }}
                    type="button"
                    aria-pressed={i === sel}
                    onClick={() => select(i)}
                    className={`mb-1.5 flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                      i !== sel
                        ? 'border-transparent hover:bg-muted/50'
                        : linked
                          ? 'border-[var(--cite)] bg-card shadow-[0_6px_18px_rgba(0,0,0,.25)]'
                          : 'border-muted-foreground/40 bg-card'
                    }`}
                  >
                    <span
                      className={`grid size-5 flex-none place-items-center rounded font-mono text-[10px] ${
                        i === sel && linked
                          ? 'bg-[var(--cite)] text-background'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span className="flex-1 text-[12.5px] leading-relaxed">{c.text}</span>
                    <span className="flex flex-none items-center gap-1.5">
                      {c.jd && (
                        <span
                          title="Answers a line of the posting"
                          className="rounded px-1.5 py-0.5 font-mono text-[9.5px] tracking-wide text-[var(--color-cite-jd)] bg-[var(--color-cite-jd-fill)]"
                        >
                          JD
                        </span>
                      )}
                      {c.cvSpan ? (
                        <LinkIcon className="size-3 text-[var(--color-cite-cv)]" />
                      ) : (
                        <UnlinkIcon className="text-muted-foreground/60 size-3" />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </section>

        {/* The gutter the connector is drawn through. Empty by design. */}
        <div aria-hidden="true" className="hidden lg:block" />

        {/* Right: the documents, as documents. */}
        <section
          aria-label="Source documents"
          className="flex min-h-0 flex-col bg-background lg:border-l lg:border-border"
        >
          <div
            role="tablist"
            className="flex h-11 flex-none items-stretch gap-1 border-b border-border px-2"
          >
            {(
              [
                ['cv', cv.kind === 'imported' ? 'Base CV' : 'Your stored facts'],
                ['jd', 'Job description'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`border-b-2 px-3 text-[12.5px] font-medium transition-colors ${
                  tab === id
                    ? 'text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
                style={
                  tab === id
                    ? {
                        borderBottomColor:
                          id === 'cv' ? 'var(--color-cite-cv)' : 'var(--color-cite-jd)',
                      }
                    : undefined
                }
              >
                {label}
              </button>
            ))}
            {tab === 'cv' && cv.kind === 'facts' && (
              <span className="text-muted-foreground ml-auto self-center text-[11px]">
                No imported CV stored — re-import one in Settings to cite the original
              </span>
            )}
          </div>

          <div ref={viewerRef} className="min-h-0 flex-1 overflow-y-auto bg-background p-6">
            <Paper
              text={docText}
              span={span}
              markRef={markRef}
              empty={
                tab === 'cv'
                  ? 'Nothing imported yet. Import your CV in Settings and generated lines will be shown against it.'
                  : 'This application has no job description stored.'
              }
            />
          </div>
        </section>

        {/* Decorative: the evidence bar below says the same thing in words. */}
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 hidden h-full w-full overflow-visible lg:block"
        >
          <title>Citation connector</title>
          {arrow && (
            <>
              <path d={arrow.d} fill="none" stroke="var(--cite)" strokeWidth={8} opacity={0.12} />
              <path
                d={arrow.d}
                fill="none"
                stroke="var(--cite)"
                strokeWidth={2}
                strokeLinecap="round"
                strokeDasharray="7 6"
                className="motion-safe:animate-dash"
              />
              <path
                d={`M ${arrow.x2 + 6} ${arrow.y2} L ${arrow.x2 - 5} ${arrow.y2 - 5.5} L ${arrow.x2 - 5} ${arrow.y2 + 5.5} Z`}
                fill="var(--cite)"
              />
            </>
          )}
          {stub && (
            <>
              <path
                d={`M ${stub.x} ${stub.y} L ${stub.x + 54} ${stub.y}`}
                fill="none"
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={2}
                strokeDasharray="7 6"
              />
              <path
                d={`M ${stub.x + 62} ${stub.y - 5} l 10 10 m 0 -10 l -10 10`}
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={2}
                strokeLinecap="round"
              />
            </>
          )}
          {/* The anchor on the row itself, so the line reads as leaving it. */}
          {(arrow || stub) && (
            <circle
              cx={arrow ? arrow.x1 : (stub?.x ?? 0)}
              cy={arrow ? arrow.y1 : (stub?.y ?? 0)}
              r={4}
              fill="hsl(var(--background))"
              stroke={arrow ? 'var(--cite)' : 'hsl(var(--muted-foreground))'}
              strokeWidth={2}
            />
          )}
        </svg>
      </div>

      {/* The same information as the arrow, in words, for anyone the arrow does
          not reach. */}
      <footer
        aria-live="polite"
        className="flex flex-none flex-wrap items-center gap-x-4 gap-y-2 border-t border-border bg-card px-5 py-3"
      >
        <span className="text-muted-foreground font-mono text-[10.5px] tracking-wide">
          LINE {sel + 1} OF {claims.length}
        </span>
        {ground && (
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ground.className}`}>
            {ground.label}
          </span>
        )}
        <p className="text-muted-foreground min-w-[16rem] flex-1 text-[12.5px] leading-relaxed">
          {/* Whatever is highlighted on the right is what this sentence is
              about — otherwise it explains one document while showing another. */}
          {tab === 'cv'
            ? ground?.note
            : claim?.jd
              ? 'The line of the posting this answers is highlighted on the right. The claim itself still comes from your CV.'
              : 'The model did not tie this line to any single line of the posting.'}
          {claim?.jd && (
            <span className="mt-0.5 block text-[11.5px] text-[var(--color-cite-jd)]">
              Answers: “{claim.jd.text.replace(/\s+/g, ' ').trim()}”
            </span>
          )}
        </p>
        {claim?.jd && (
          <Button variant="outline" size="sm" onClick={() => setTab(tab === 'cv' ? 'jd' : 'cv')}>
            <FileTextIcon />
            {tab === 'cv' ? 'Show in posting' : 'Show in CV'}
          </Button>
        )}
      </footer>
    </div>
  );
}
