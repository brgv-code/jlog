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
  HistoryIcon,
  LinkIcon,
  SparklesIcon,
  UnlinkIcon,
} from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CvDocument, CvSpan, FactOrigins } from '../../lib/cvSource';
import { Button } from '../ui/button';
import { PdfPaper } from './PdfPaper';

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
  /** Where each stored phrasing was written. Empty is a supported state. */
  origins: FactOrigins;
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
 * Where the evidence for a generated line actually is.
 *
 * The first version of this assumed the evidence was always in the imported CV,
 * and for this product that assumption is wrong by design: facts are mined from
 * every CV the owner has sent — a corpus of 67 documents against a base holding
 * 12 bullets — so most lines cannot be in the base CV and never could be.
 * Reporting that as "no line to point at" described a failure where there was
 * none, and buried the citation that does exist.
 *
 * There is still no "unsupported": the agent selects fact ids and the renderer
 * resolves every one, so a line from nowhere cannot exist. What varies is which
 * document can be shown for it.
 */
type Grounding = 'page' | 'history' | 'stored';

const GROUNDING: Record<Grounding, { label: string; className: string }> = {
  page: {
    label: 'In your CV',
    className: 'bg-[var(--color-cite-cv-fill)] text-[var(--color-cite-cv)]',
  },
  history: {
    label: 'From an application you sent',
    className: 'bg-primary/15 text-primary',
  },
  stored: {
    label: 'In your profile',
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
  /** One sentence naming where this line comes from. Always something true. */
  provenance: string;
};

/**
 * "Senior PM at Acme" — the application this phrasing was written for.
 *
 * Null for a phrasing that came from CV import, because there the recorded
 * company is the EMPLOYER the bullet sits under rather than anywhere it was
 * sent. Same two columns, opposite meaning, and saying "you wrote this for
 * App Developer at Foundamental" about a job someone held would be worse than
 * saying nothing.
 */
function wrote(origin: {
  source: string | null;
  roleTitle: string | null;
  company: string | null;
}): string | null {
  if (origin.source === null || origin.source === 'import') return null;
  const where = [origin.roleTitle, origin.company].filter(Boolean).join(' at ');
  return where || null;
}

/**
 * The one decision about where a line came from.
 *
 * Label and sentence are produced together on purpose. Deriving them from two
 * separate conditions let them disagree — a phrasing taken from the imported CV
 * could be labelled "from an application you sent" while the sentence below it
 * said otherwise — and a citation that contradicts itself is worse than a vague
 * one. Branches are ordered by how specific the answer is: the page that can be
 * shown, then the application that can be named, then the applications the
 * claim has appeared in, then the document the wording came from, then nothing.
 */
function cite(
  cvSpan: CvSpan | null,
  variantId: string | undefined,
  origin: FactOrigins['variants'][string] | undefined,
  fact: FactOrigins['facts'][string] | undefined,
): { grounding: Grounding; provenance: string } {
  if (cvSpan) {
    return {
      grounding: 'page',
      provenance: variantId
        ? 'The highlighted line is this fact in your CV. The wording here is one you used in an earlier application.'
        : 'These are the words in your CV, selected for this posting.',
    };
  }

  const wroteFor = origin ? wrote(origin) : null;
  if (wroteFor) {
    return { grounding: 'history', provenance: `You wrote this for ${wroteFor}.` };
  }

  if (fact?.companies.length) {
    return {
      grounding: 'history',
      provenance: `You have used this claim in applications to ${fact.companies.slice(0, 3).join(', ')}.`,
    };
  }

  if (origin?.source === 'import') {
    return {
      grounding: 'stored',
      provenance:
        'From the CV you imported, though these exact words could not be found in the text read out of it.',
    };
  }

  return {
    grounding: 'stored',
    provenance: 'From your stored facts. Nothing recorded which document this wording came from.',
  };
}

function buildClaims(selected: SelectedRole[], cv: CvDocument, origins: FactOrigins): Claim[] {
  return selected.flatMap((role, roleIndex) =>
    role.bullets.map((bullet, i) => {
      const cvSpan = cv.spans[bullet.factId] ?? null;
      const origin = bullet.variantId ? origins.variants[bullet.variantId] : undefined;
      const { grounding, provenance } = cite(
        cvSpan,
        bullet.variantId,
        origin,
        origins.facts[bullet.factId],
      );

      return {
        key: `${bullet.factId}:${bullet.variantId ?? ''}:${roleIndex}:${i}`,
        roleIndex,
        text: bullet.text,
        factId: bullet.factId,
        ...(bullet.variantId ? { variantId: bullet.variantId } : {}),
        cvSpan,
        jd: bullet.jd,
        grounding,
        provenance,
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
  weak,
  empty,
}: {
  text: string;
  span: CvSpan | null;
  markRef: (el: HTMLElement | null) => void;
  /** Draw the highlight as unverified — dashed rather than ringed. */
  weak?: boolean;
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
    <article className="mx-auto w-full max-w-[660px] whitespace-pre-wrap break-words rounded-sm border border-border/60 bg-[var(--color-paper)] px-8 py-9 text-[12.5px] leading-[1.65] text-[var(--color-paper-ink)] shadow-[var(--shadow-lg)]">
      <span className={dim}>{before}</span>
      {span && (
        <mark
          ref={markRef}
          // Cloned decoration so a passage that wraps is boxed line by line
          // rather than as one ragged rectangle spanning the gap.
          className={`rounded-[3px] bg-[color:var(--cite-fill)] px-[3px] py-[1px] text-inherit [box-decoration-break:clone] [-webkit-box-decoration-break:clone] ${
            weak
              ? 'outline outline-1 outline-dashed outline-[var(--cite)]'
              : 'shadow-[0_0_0_1px_var(--cite)]'
          }`}
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
  origins,
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
  /**
   * The document has this fact, and the rendered page could not be made to
   * point at it — a ligature or a soft hyphen the text layer spells differently
   * from the extraction. Rare, and said out loud rather than shown as a claim
   * with no highlight and no explanation.
   */
  const [pageMissed, setPageMissed] = useState(false);

  const bodyRef = useRef<HTMLDivElement>(null);
  const claimsRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  /**
   * State rather than a ref, because the passage can arrive after the render
   * that selected it — the pages are fetched and rasterised asynchronously, and
   * a ref would leave the connector drawn as a dead stub against a highlight
   * that is now on screen.
   */
  const [markEl, setMarkEl] = useState<HTMLElement | null>(null);
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Memoised because `draw` depends on it: rebuilding the array every render
  // would give the callback a new identity every render, and since `draw` sets
  // state, the layout effect watching it would loop forever.
  const claims = useMemo(() => buildClaims(selected, cv, origins), [selected, cv, origins]);
  const claim = claims[sel];
  const onPage = claims.filter((c) => c.grounding === 'page').length;
  const fromHistory = claims.filter((c) => c.grounding === 'history').length;

  const span: CvSpan | null =
    tab === 'cv' ? (claim?.cvSpan ?? null) : claim?.jd ? [claim.jd.start, claim.jd.end] : null;
  const docText = tab === 'cv' ? cv.text : jobDescription;
  /**
   * What to look for on the page: the words as they appear in the CV, taken
   * from the stored span, not the line as generated. For a bullet that used a
   * phrasing from an earlier application those two differ, and only one of them
   * is on the page.
   */
  const cvWords = claim?.cvSpan ? cv.text.slice(claim.cvSpan[0], claim.cvSpan[1]) : null;
  const showPages = tab === 'cv' && cv.hasFile;
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

    const mark = markEl;
    const viewer = viewerRef.current;
    // The connector is reserved for the citation that is actually verified. A
    // job-description match is the model's opinion with a substring check on
    // top, and drawing the same arrow to it claimed a certainty nothing here
    // establishes.
    if (tab === 'jd') {
      setArrow(null);
      setStub(null);
      return;
    }
    if (!mark || !viewer) {
      setArrow(null);
      // The crossed-out stub means "nothing recorded where these words came
      // from". A line whose origin IS known, just not on this page, has a
      // citation — the evidence bar is carrying it — and marking that as a dead
      // end called a working citation a failure.
      setStub(claims[sel]?.grounding === 'stored' ? { x: x1, y: y1 } : null);
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
  }, [sel, markEl, tab, claims]);

  // Layout has to settle before the passage can be measured, and the scroll it
  // triggers is what most of the redraws below are chasing.
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [draw]);

  // Whenever the passage changes — including the first time the pages finish
  // rendering — bring it into view.
  useEffect(() => {
    markEl?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [markEl]);

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
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border py-3 pr-12 pl-5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium">
            {role} <span className="text-muted-foreground">at {company}</span>
          </p>
          <p className="text-muted-foreground mt-0.5 text-[12px]">
            {claims.length} line{claims.length === 1 ? '' : 's'}, every one selected from your
            stored facts
            {onPage ? ` · ${onPage} shown on your CV` : ''}
            {fromHistory ? ` · ${fromHistory} from applications you sent` : ''}
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
                const linked = tab === 'cv' && c.grounding === 'page';
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
                          ? 'border-[var(--cite)] bg-card shadow-[var(--shadow-md)]'
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
                          title="The model matched this to a line of the posting"
                          className="text-muted-foreground/70 rounded px-1 font-mono text-[9.5px] tracking-wide"
                        >
                          jd?
                        </span>
                      )}
                      {c.grounding === 'page' ? (
                        <LinkIcon className="size-3 text-[var(--color-cite-cv)]" />
                      ) : c.grounding === 'history' ? (
                        <HistoryIcon className="text-muted-foreground size-3" />
                      ) : (
                        <UnlinkIcon className="text-muted-foreground/50 size-3" />
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
            {/*
              The posting is stored, but this particular line was not matched to
              any of it. Without saying so the pane is a wall of dimmed text with
              nothing indicated — indistinguishable from a highlight that failed
              to render. The posting stays readable below; it is still worth
              reading, it just is not evidence for this line.
            */}
            {tab === 'jd' && docText && !claim?.jd && (
              <div className="border-border bg-muted/40 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2">
                <span className="text-muted-foreground text-[11.5px] leading-relaxed">
                  The model did not match this line to the posting. It comes from your{' '}
                  {cv.kind === 'imported' ? 'CV' : 'stored facts'}.
                </span>
                <Button variant="outline" size="sm" onClick={() => setTab('cv')}>
                  <FileTextIcon />
                  {cv.kind === 'imported' ? 'Show in CV' : 'Show the fact'}
                </Button>
              </div>
            )}
            {showPages ? (
              <PdfPaper
                highlight={cvWords}
                markRef={setMarkEl}
                onMatch={(found) => setPageMissed(Boolean(cvWords) && !found)}
                // A file that will not open is not a reason to show nothing: the
                // extracted text still carries the citation.
                fallback={<Paper text={docText} span={span} markRef={setMarkEl} empty="" />}
              />
            ) : (
              <Paper
                text={docText}
                span={span}
                markRef={setMarkEl}
                weak={tab === 'jd'}
                empty={
                  tab === 'cv'
                    ? 'Nothing imported yet. Import your CV in Settings and generated lines will be shown against it.'
                    : 'This application has no job description stored.'
                }
              />
            )}
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
          {/* Where this line comes from. Always the same sentence regardless of
              which tab is open, because it is a fact about the line, not about
              whatever document happens to be on screen. */}
          {claim?.provenance}
          {tab === 'cv' && pageMissed && (
            <span className="text-muted-foreground/80 mt-0.5 block text-[11.5px]">
              This line is in your CV but could not be located on the rendered page.
            </span>
          )}
          {/* Deliberately quieter than the line above, and worded as the model's
              doing. Everything else here is checked; this is the one thing that
              is only checked for being IN the posting, not for being the right
              line of it, and it must not read as though it were verified. */}
          {claim?.jd && (
            <span className="text-muted-foreground/70 mt-0.5 block text-[11.5px] italic">
              The model matched this to “{claim.jd.text.replace(/\s+/g, ' ').trim()}” in the
              posting.
            </span>
          )}
        </p>
        {(claim?.jd || tab === 'jd') && (
          <Button variant="outline" size="sm" onClick={() => setTab(tab === 'cv' ? 'jd' : 'cv')}>
            <FileTextIcon />
            {tab === 'cv' ? 'Show in posting' : 'Show in CV'}
          </Button>
        )}
      </footer>
    </div>
  );
}
