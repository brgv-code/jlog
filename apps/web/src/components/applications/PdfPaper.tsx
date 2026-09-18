/**
 * The imported CV, rendered as the pages it actually is.
 *
 * Reflowed text was enough to prove a citation and not enough to trust one: the
 * columns, fonts and spacing that make a CV recognisable as yours are exactly
 * what the extraction throws away, and a highlight landing on a text dump asks
 * you to take on faith that the dump came from your document. Here the
 * highlight lands on the page.
 *
 * pdf.js is loaded on demand — it is over a megabyte, and the dialog it belongs
 * to is not on the path of anyone who is not tailoring a CV.
 */
import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { type PdfMatch, type TextItemLike, findOnPages } from '../../lib/pdfHighlight';

/** Rendering width per page, in CSS pixels, before device scaling. */
const PAGE_WIDTH = 620;

type Doc = {
  pages: { canvas: HTMLCanvasElement; width: number; height: number }[];
  /** Per page, the text items, kept so a selection can be located without re-parsing. */
  text: TextItemLike[][];
  /** Multiply PDF user-space coordinates by this to reach rendered pixels. */
  viewports: { scale: number; height: number }[];
};

type State =
  | { status: 'loading' }
  | { status: 'ready'; doc: Doc }
  | { status: 'unavailable'; reason: string };

interface Props {
  /** The text of the claim to highlight, or null to show the document plain. */
  highlight: string | null;
  /** Called with whether this render could point at the claim. */
  onMatch?: (found: boolean) => void;
  /**
   * Called with the first highlight box, so the connector can be drawn to it.
   * A callback rather than a ref object: the box appears only once the pages
   * have rasterised, and the caller has to hear about it when it does.
   */
  markRef: (el: HTMLElement | null) => void;
  /** Rendered when there is no file to show; the caller falls back to text. */
  fallback: React.ReactNode;
}

export function PdfPaper({ highlight, onMatch, markRef, fallback }: Props) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await apiFetch('/api/profile/cv-source/file');
        // 404 is the ordinary answer for a pasted CV or an import from before
        // files were kept, so it is a state rather than an error.
        if (!res.ok) {
          if (!cancelled) setState({ status: 'unavailable', reason: 'no-file' });
          return;
        }
        const bytes = await res.arrayBuffer();

        // The legacy build, not the modern one. pdf.js v6's default bundle calls
        // Uint8Array.prototype.toHex, which only landed in Chromium 140 — on
        // anything older the viewer dies with "toHex is not a function" and the
        // pane silently falls back to text. The legacy build is transpiled and
        // polyfilled for exactly this, and it is lazy-loaded either way.
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
        // Bundled through Vite rather than fetched from a CDN: the worker has to
        // come from the same origin, and a version skew between it and the
        // library is a blank page with a console error.
        pdfjs.GlobalWorkerOptions.workerSrc = (
          await import('pdfjs-dist/legacy/build/pdf.worker.mjs?url')
        ).default;

        const pdf = await pdfjs.getDocument({ data: bytes }).promise;
        const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
        const doc: Doc = { pages: [], text: [], viewports: [] };

        for (let n = 1; n <= pdf.numPages; n++) {
          const page = await pdf.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const scale = PAGE_WIDTH / base.width;
          const viewport = page.getViewport({ scale: scale * dpr });

          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const context = canvas.getContext('2d');
          if (!context) continue;
          await page.render({ canvas, canvasContext: context, viewport }).promise;

          const content = await page.getTextContent();
          doc.pages.push({
            canvas,
            width: viewport.width / dpr,
            height: viewport.height / dpr,
          });
          // Marked-content entries carry structure, not text, and have none of
          // the geometry the highlight is computed from.
          doc.text.push(content.items.filter((i) => 'str' in i) as TextItemLike[]);
          doc.viewports.push({ scale, height: base.height });
        }

        if (!cancelled) setState({ status: 'ready', doc });
      } catch {
        if (!cancelled) setState({ status: 'unavailable', reason: 'unreadable' });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Canvases are created off-DOM, so they have to be attached after each render. */
  useEffect(() => {
    if (state.status !== 'ready') return;
    for (const [index, page] of state.doc.pages.entries()) {
      const slot = hostRef.current?.querySelector(`[data-page="${index}"] .canvas-slot`);
      if (slot && slot.firstChild !== page.canvas) {
        slot.replaceChildren(page.canvas);
        page.canvas.style.width = `${page.width}px`;
        page.canvas.style.height = `${page.height}px`;
        page.canvas.style.display = 'block';
      }
    }
  }, [state]);

  const match: PdfMatch | null =
    state.status === 'ready' && highlight ? findOnPages(state.doc.text, highlight) : null;

  useEffect(() => {
    if (state.status === 'ready') onMatch?.(Boolean(match));
  }, [match, state.status, onMatch]);

  if (state.status === 'unavailable') return <>{fallback}</>;

  if (state.status === 'loading') {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center text-[13px]">
        Opening your CV…
      </div>
    );
  }

  return (
    <div ref={hostRef} className="flex flex-col items-center gap-5">
      {state.doc.pages.map((page, index) => {
        const viewport = state.doc.viewports[index];
        const boxes = match?.pageIndex === index ? match.rects : [];
        return (
          <div
            // Pages have no identity beyond their position in the document.
            // biome-ignore lint/suspicious/noArrayIndexKey: index IS the page number
            key={index}
            data-page={index}
            className="relative shadow-[var(--shadow-lg)]"
            style={{ width: page.width, height: page.height }}
          >
            <div className="canvas-slot" />

            {/* Dimming the rest of the page is what makes one box read as "this
                line" rather than as an annotation floating over a document. */}
            {match && match.pageIndex !== index && (
              <div className="pointer-events-none absolute inset-0 bg-[var(--color-paper)]/55" />
            )}

            {boxes.map((rect, i) => {
              const { scale, height } = viewport ?? { scale: 1, height: page.height };
              // PDF user space has its origin at the bottom left; CSS does not.
              const top = (height - rect.y - rect.height) * scale;
              return (
                <mark
                  // Boxes are positional too — one per line of the match.
                  // biome-ignore lint/suspicious/noArrayIndexKey: positional by nature
                  key={i}
                  ref={i === 0 ? markRef : undefined}
                  className="pointer-events-none absolute rounded-[2px] bg-[color:var(--cite-fill)] shadow-[0_0_0_1.5px_var(--cite)]"
                  style={{
                    left: rect.x * scale - 2,
                    top: top - 2,
                    width: rect.width * scale + 4,
                    height: rect.height * scale + 4,
                  }}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
