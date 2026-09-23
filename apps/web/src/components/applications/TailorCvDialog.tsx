import { templateConfig, templateStyle } from '@jlog/shared';
import { AlertTriangleIcon, FileTextIcon, SparklesIcon } from 'lucide-react';
import { useState } from 'react';
import { apiFetch } from '../../lib/api';
import { useBillingEnabled } from '../../lib/billing';
import type { CvProfile } from '../../lib/cvProfile';
import {
  type CvDocument,
  type FactOrigins,
  NO_ORIGINS,
  loadCvDocument,
  loadFactOrigins,
} from '../../lib/cvSource';
import { photoAsset } from '../../lib/photo';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Skeleton } from '../ui/skeleton';
import { GroundedCvView, type SelectedRole } from './GroundedCvView';

type TailorResponse = {
  // The selection the run settled on, in the shape `/documents/compile` takes.
  // Opaque here on purpose: resolving fact ids is the private package's job.
  spec: unknown;
  tex: string;
  selected: SelectedRole[];
  reasoning?: string;
  attempts: number;
  corrections: string[];
};

type ApiError = { error: { code: string; message: string; corrections?: string[] } };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string;
  company: string;
  role: string;
  jobDescription: string;
  profile: CvProfile;
}

/** Copy tuned per failure so the dialog never says "something went wrong". */
const ERROR_COPY: Record<string, { title: string; body: string }> = {
  PRO_REQUIRED: {
    title: 'Tailoring is a Pro feature',
    body: 'Generating a job-specific CV from your facts needs a jlog Pro subscription.',
  },
  LLM_NOT_CONFIGURED: {
    title: 'No model configured',
    body: 'Add an LLM provider in Settings and tailoring will use it.',
  },
  COMPILE_NOT_CONFIGURED: {
    title: 'Compile service unavailable',
    body: 'The PDF service is not configured on this deployment. The LaTeX above is still yours to download.',
  },
  LLM_CALL_FAILED: {
    title: 'The model could not be reached',
    body: 'Your provider rejected the request. The reason it gave is below.',
  },
  TAILORING_FAILED: {
    title: 'The model could not settle on a selection',
    body: 'It kept referencing facts that do not exist. What it got wrong is listed below.',
  },
};

export function TailorCvDialog({
  open,
  onOpenChange,
  company,
  role,
  jobDescription,
  profile,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TailorResponse | null>(null);
  const [cv, setCv] = useState<CvDocument | null>(null);
  const [origins, setOrigins] = useState<FactOrigins>(NO_ORIGINS);
  const [error, setError] = useState<ApiError['error'] | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const billingEnabled = useBillingEnabled();

  // The design the user picked in the gallery. Sent as the shape the renderer
  // needs rather than the id, so the private package never has to know the
  // catalogue — it depends on hono and nothing else.
  const design = templateConfig(profile.template);
  const style = templateStyle(design);
  const body = {
    jobDescription,
    targetRole: role,
    targetCompany: company,
    template: style,
    chrome: {
      firstName: profile.firstName,
      lastName: profile.lastName,
      ...(profile.title ? { title: profile.title } : {}),
      ...(profile.address ? { address: profile.address } : {}),
      ...(profile.email ? { email: profile.email } : {}),
      ...(profile.homepage ? { homepage: profile.homepage } : {}),
      ...(profile.photo ? { photo: profile.photo } : {}),
      ...(profile.socials.length ? { socials: profile.socials } : {}),
      ...(profile.summary ? { summary: profile.summary } : {}),
      ...(profile.sections.length ? { sections: profile.sections } : {}),
    },
  };

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      // The document is fetched alongside the generation, not after it: the
      // result is only worth showing next to what it is cited against, and
      // waiting for a second round trip would show it alone first.
      // The photo only matters if the chosen design emits one, so a template
      // that drops it costs no fetch at all.
      const files =
        style.chrome.includes('photo') && profile.photo ? await photoAsset(profile.photo) : null;

      const [res, cvDoc, factOrigins] = await Promise.all([
        apiFetch('/api/pro/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(files ? { ...body, files } : body),
        }),
        loadCvDocument(),
        loadFactOrigins(),
      ]);
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as ApiError | null;
        setError(payload?.error ?? { code: 'UNKNOWN', message: `Request failed (${res.status}).` });
        return;
      }
      const payload = (await res.json()) as TailorResponse;
      setCv(cvDoc);
      setOrigins(factOrigins);
      // Rendering reduces and maps over `selected`. A response without it is a
      // server bug, but reading it off undefined here throws during render and
      // takes the whole dashboard down — a dialog cannot be worth that.
      setResult({ ...payload, selected: payload.selected ?? [] });
    } catch {
      setError({ code: 'NETWORK', message: 'Could not reach the API.' });
    } finally {
      setLoading(false);
    }
  }

  /**
   * Compile the spec already on screen — never generate again.
   *
   * Downloading used to re-post to `/generate`, which re-ran the model: a
   * second, independent selection. The PDF was then not guaranteed to be the
   * document the citations describe, which is the one thing this view promises.
   * `/documents/compile` renders the same spec and makes no model call.
   */
  async function downloadPdf() {
    if (!result?.spec) {
      setError({
        code: 'UNKNOWN',
        message: 'This result cannot be compiled. Generate it again and retry the download.',
      });
      return;
    }
    setDownloading(true);
    try {
      const files =
        style.chrome.includes('photo') && profile.photo ? await photoAsset(profile.photo) : null;
      const res = await apiFetch('/api/pro/documents/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(files ? { spec: result.spec, files } : { spec: result.spec }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as ApiError | null;
        setError(payload?.error ?? { code: 'UNKNOWN', message: 'Compile failed.' });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `CV — ${company}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError({ code: 'NETWORK', message: 'Could not reach the API.' });
    } finally {
      setDownloading(false);
    }
  }

  async function copyTex() {
    if (!result) return;
    await navigator.clipboard.writeText(result.tex);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  /**
   * A result needs the room a citation view takes; everything before it is a
   * paragraph and a button. So the dialog grows once there is something to
   * compare, rather than opening at full size around an empty state.
   */
  const grounded = result !== null && cv !== null;

  /**
   * A failure during regenerate or compile happens with a result already on
   * screen, where the error panel below never renders. It goes to the view as a
   * line it can show instead, rather than failing silently.
   */
  const notice = grounded && error ? (ERROR_COPY[error.code]?.title ?? error.message) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={
          grounded
            ? 'h-[calc(100vh-2.5rem)] max-h-none w-[calc(100vw-2.5rem)] max-w-none gap-0 overflow-hidden p-0'
            : 'max-w-2xl gap-0 p-0'
        }
      >
        {grounded ? (
          <>
            {/* Present for screen readers and Radix; the view draws its own. */}
            <DialogTitle className="sr-only">
              Tailored CV for {role} at {company}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Each generated line, next to the passage of your CV it was selected from.
            </DialogDescription>
            <GroundedCvView
              company={company}
              role={role}
              jobDescription={jobDescription}
              selected={result.selected}
              cv={cv}
              origins={origins}
              {...(result.reasoning ? { reasoning: result.reasoning } : {})}
              attempts={result.attempts}
              onRegenerate={generate}
              onDownload={downloadPdf}
              onCopyTex={copyTex}
              regenerating={loading}
              downloading={downloading}
              copied={copied}
              notice={notice}
              onDismissNotice={() => setError(null)}
            />
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <SparklesIcon className="size-4 text-primary" />
                Tailor CV
              </DialogTitle>
              <DialogDescription>
                for {role} at {company}
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-[220px] flex-1 overflow-y-auto px-6 py-5">
              {!loading && !error && (
                <div className="flex flex-col items-center gap-4 py-8 text-center">
                  <div className="rounded-full border border-border bg-muted/40 p-3">
                    <FileTextIcon className="size-5 text-muted-foreground" />
                  </div>
                  <div className="max-w-sm space-y-1.5">
                    <p className="text-sm font-medium">Build a CV from this job description</p>
                    <p className="text-muted-foreground text-[13px] leading-relaxed">
                      Your stored facts are matched against the posting. Nothing is written from
                      scratch — and you will see each line next to the passage of your own CV it
                      came from.
                    </p>
                  </div>
                  <Button onClick={generate} className="mt-1">
                    <SparklesIcon /> Generate
                  </Button>
                </div>
              )}

              {loading && (
                <div className="space-y-6">
                  {/* Shaped like the result so nothing jumps when it arrives. */}
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="space-y-2.5">
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-3 w-20" />
                        <Skeleton className="h-3 w-40" />
                      </div>
                      <Skeleton className="h-3.5 w-full" />
                      <Skeleton className="h-3.5 w-[85%]" />
                    </div>
                  ))}
                  <p className="text-muted-foreground pt-1 text-center text-xs">
                    Matching your facts against the posting…
                  </p>
                </div>
              )}

              {error && (
                <div className="space-y-3">
                  <div className="flex gap-3 rounded-lg border border-destructive/25 bg-destructive/[0.07] px-4 py-3.5">
                    <AlertTriangleIcon className="text-destructive mt-0.5 size-4 shrink-0" />
                    <div className="space-y-1">
                      <p className="text-[13px] font-medium">
                        {ERROR_COPY[error.code]?.title ?? 'Could not tailor this CV'}
                      </p>
                      <p className="text-muted-foreground text-[13px] leading-relaxed">
                        {ERROR_COPY[error.code]?.body ?? error.message}
                      </p>
                      {ERROR_COPY[error.code] && error.message ? (
                        <p className="text-muted-foreground/70 pt-0.5 font-mono text-[11px] leading-relaxed break-words">
                          {error.message}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  {error.corrections?.length ? (
                    <ul className="text-muted-foreground space-y-1 rounded-lg border border-border bg-muted/30 px-4 py-3 font-mono text-[11px] leading-relaxed">
                      {error.corrections.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  ) : null}
                  {/* Retrying a 402 can only fail again: the account is not
                      entitled, and the fix is upstream of this dialog. Where
                      nothing is for sale (a self-hosted build) there is no
                      action to offer at all. */}
                  {error.code === 'PRO_REQUIRED' ? (
                    billingEnabled ? (
                      <Button size="sm" asChild>
                        <a href="/settings">Upgrade to Pro</a>
                      </Button>
                    ) : null
                  ) : (
                    <Button variant="outline" size="sm" onClick={generate}>
                      Try again
                    </Button>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
