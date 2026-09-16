import {
  AlertTriangleIcon,
  CheckIcon,
  DownloadIcon,
  FileTextIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from 'lucide-react';
import { useState } from 'react';
import { apiFetch } from '../../lib/api';
import type { CvProfile } from '../../lib/cvProfile';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Separator } from '../ui/separator';
import { Skeleton } from '../ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

type SelectedBullet = { factId: string; variantId?: string; text: string };
type SelectedRole = {
  roleFactId: string;
  employer: string | null;
  roleTitle: string | null;
  dates: string | null;
  bullets: SelectedBullet[];
};

type TailorResponse = {
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
  const [error, setError] = useState<ApiError['error'] | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);

  const body = {
    jobDescription,
    targetRole: role,
    targetCompany: company,
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
    setResult(null);
    try {
      const res = await apiFetch('/api/pro/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as ApiError | null;
        setError(payload?.error ?? { code: 'UNKNOWN', message: `Request failed (${res.status}).` });
        return;
      }
      const payload = (await res.json()) as TailorResponse;
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

  async function downloadPdf() {
    setDownloading(true);
    try {
      const res = await apiFetch('/api/pro/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, compile: true }),
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

  const bulletCount = result?.selected.reduce((n, r) => n + r.bullets.length, 0) ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 p-0">
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
          {!result && !loading && !error && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="rounded-full border border-border bg-muted/40 p-3">
                <FileTextIcon className="size-5 text-muted-foreground" />
              </div>
              <div className="max-w-sm space-y-1.5">
                <p className="text-sm font-medium">Build a CV from this job description</p>
                <p className="text-muted-foreground text-[13px] leading-relaxed">
                  Your stored facts are matched against the posting. Nothing is written from scratch
                  — every bullet comes from something you have already claimed.
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
              <Button variant="outline" size="sm" onClick={generate}>
                Try again
              </Button>
            </div>
          )}

          {result && (
            <TooltipProvider>
              <div className="space-y-5">
                {result.reasoning && (
                  <p className="text-muted-foreground border-l-2 border-primary/40 pl-3 text-[13px] leading-relaxed italic">
                    {result.reasoning}
                  </p>
                )}

                {result.selected.map((r, roleIndex) => (
                  <div
                    key={r.roleFactId}
                    className="animate-fade-up space-y-2"
                    style={{ animationDelay: `${roleIndex * 60}ms` }}
                  >
                    <div className="flex items-baseline gap-2.5">
                      <span className="text-muted-foreground font-mono text-[11px] tabular-nums">
                        {r.dates}
                      </span>
                      <span className="text-[13px] font-medium">{r.roleTitle}</span>
                      <span className="text-muted-foreground text-[13px]">{r.employer}</span>
                    </div>
                    <ul className="space-y-1.5 pl-[1.15rem]">
                      {r.bullets.map((b) => (
                        <Tooltip key={b.factId + (b.variantId ?? '')}>
                          <TooltipTrigger asChild>
                            <li className="text-foreground/90 hover:text-foreground relative cursor-default text-[13px] leading-relaxed transition-colors before:absolute before:-left-[1.15rem] before:text-muted-foreground before:content-['—']">
                              {b.text}
                            </li>
                          </TooltipTrigger>
                          <TooltipContent side="left">
                            <span className="font-mono text-[10px]">
                              {b.variantId ? `${b.factId} · ${b.variantId}` : b.factId}
                            </span>
                          </TooltipContent>
                        </Tooltip>
                      ))}
                    </ul>
                  </div>
                ))}

                <Separator />

                {/* The product's actual promise, stated once and quietly. */}
                <div className="text-muted-foreground flex items-center gap-2 text-xs">
                  <ShieldCheckIcon className="text-success size-3.5" />
                  <span>
                    {bulletCount} bullet{bulletCount === 1 ? '' : 's'}, each traced to a stored fact
                  </span>
                  {result.attempts > 1 && (
                    <>
                      <span className="text-border">·</span>
                      <Tooltip>
                        <TooltipTrigger className="cursor-default underline decoration-dotted underline-offset-2">
                          resolved on attempt {result.attempts}
                        </TooltipTrigger>
                        <TooltipContent>
                          {result.corrections.map((c) => (
                            <p key={c} className="font-mono text-[10px] leading-relaxed">
                              {c}
                            </p>
                          ))}
                        </TooltipContent>
                      </Tooltip>
                    </>
                  )}
                </div>
              </div>
            </TooltipProvider>
          )}
        </div>

        {result && (
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={copyTex}>
              {copied ? <CheckIcon /> : null}
              {copied ? 'Copied' : 'Copy LaTeX'}
            </Button>
            <Button variant="outline" size="sm" onClick={generate} disabled={loading}>
              <SparklesIcon /> Regenerate
            </Button>
            <Button size="sm" onClick={downloadPdf} disabled={downloading}>
              <DownloadIcon /> {downloading ? 'Compiling…' : 'Download PDF'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
