import {
  CV_TEMPLATES,
  type CvTemplate,
  TEMPLATE_TAGS,
  type TemplateTag,
  templateChips,
  templateConfig,
  templatesWithTag,
} from '@jlog/shared';
import { CheckIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/button';

/**
 * The template gallery.
 *
 * The thumbnail is the proposition. You choose a CV design by looking at it,
 * not by reading a feature list — so each card leads with a real rendered first
 * page, and everything else is secondary.
 *
 * Tags narrow, they never forbid. An earlier cut of this restricted templates
 * by country, which is both paternalistic and wrong: someone in Berlin may well
 * want a one-page ATS-safe CV. Conventions like "no photo" appear as facts on
 * the card, not as locks.
 */

/**
 * Renders page one of a committed sample PDF.
 *
 * pdfjs is already a dependency here for the CV viewer, so the gallery shows
 * genuine compiler output rather than a mockup that drifts from it — and there
 * is no rasterisation step in the build.
 */
function PreviewPage({ src, label }: { src: string; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Same setup as PdfPaper: the legacy build, and a worker bundled
        // through Vite rather than fetched from a CDN. A version skew between
        // worker and library is a blank canvas with a console error.
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
        pdfjs.GlobalWorkerOptions.workerSrc = (
          await import('pdfjs-dist/legacy/build/pdf.worker.mjs?url')
        ).default;

        const doc = await pdfjs.getDocument({ url: src }).promise;
        const page = await doc.getPage(1);
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;

        // Render at the card's width, scaled for the device so the type stays
        // crisp — a blurry thumbnail of a typeset document is worse than none.
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const base = page.getViewport({ scale: 1 });
        const scale = (canvas.clientWidth / base.width) * dpr;
        const viewport = page.getViewport({ scale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        await page.render({ canvas, canvasContext: ctx, viewport }).promise;
        if (!cancelled) setState('ready');
      } catch {
        if (!cancelled) setState('missing');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [src]);

  if (state === 'missing') {
    return (
      <div className="bg-muted text-muted-foreground flex aspect-[1/1.414] flex-col items-center justify-center gap-1.5 rounded-sm p-4 text-center text-[11px] leading-relaxed">
        <span>No preview for {label} yet</span>
        <code className="text-[10px]">render-templates.mjs</code>
      </div>
    );
  }

  return (
    <div className="bg-muted relative aspect-[1/1.414] overflow-hidden rounded-sm">
      <canvas
        ref={canvasRef}
        aria-label={`${label} template, first page`}
        className="h-full w-full object-contain"
      />
    </div>
  );
}

export function TemplateGallery({
  value,
  onChange,
}: {
  value: CvTemplate;
  onChange: (t: CvTemplate) => void;
}) {
  const [tag, setTag] = useState<TemplateTag | null>(null);
  const shown = templatesWithTag(tag);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
          Template
        </span>
        <span className="text-muted-foreground text-[11px] leading-relaxed">
          Every design works for any application. The notes on each card are conventions, not
          restrictions.
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setTag(null)}
          className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
            tag === null
              ? 'border-foreground/25 bg-secondary text-foreground'
              : 'border-border text-muted-foreground hover:text-foreground'
          }`}
        >
          All {CV_TEMPLATES.length}
        </button>
        {TEMPLATE_TAGS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTag(t === tag ? null : t)}
            className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
              t === tag
                ? 'border-foreground/25 bg-secondary text-foreground'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
        {shown.map((config) => {
          const selected = config.id === value;
          return (
            <div
              key={config.id}
              className={`flex flex-col gap-2 rounded-lg border p-2 transition-colors ${
                selected ? 'border-foreground/30 bg-secondary/40' : 'border-border'
              }`}
            >
              <PreviewPage src={config.preview} label={config.label} />

              <div className="flex flex-col gap-1.5 px-1 pb-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-medium">{config.label}</span>
                  {selected && (
                    <span className="text-muted-foreground inline-flex items-center gap-1 text-[11px]">
                      <CheckIcon className="size-3" />
                      In use
                    </span>
                  )}
                </div>

                <p className="text-muted-foreground text-[11px] leading-relaxed">{config.blurb}</p>

                <div className="flex flex-wrap gap-1">
                  {templateChips(config).map((chip) => (
                    <span
                      key={chip}
                      className="text-muted-foreground border-border rounded border px-1.5 py-0.5 text-[10px]"
                    >
                      {chip}
                    </span>
                  ))}
                </div>

                {!selected && (
                  <Button variant="outline" size="sm" onClick={() => onChange(config.id)}>
                    Use this template
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
