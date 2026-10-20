import { templateConfig, templateStyle } from '@jlog/shared';
import { useEffect, useState } from 'react';
import type { SelectedRole } from '../components/applications/GroundedCvView';
import { apiFetch } from './api';
import type { CvProfile } from './cvProfile';
import {
  type CvDocument,
  type FactOrigins,
  NO_ORIGINS,
  loadCvDocument,
  loadFactOrigins,
} from './cvSource';
import { photoAsset } from './photo';

export type TailorResponse = {
  // The selection the run settled on, in the shape `/documents/compile` takes.
  // Opaque here on purpose: resolving fact ids is the private package's job.
  spec: unknown;
  tex: string;
  selected: SelectedRole[];
  reasoning?: string;
  attempts: number;
  corrections: string[];
};

export type TailorError = { code: string; message: string; corrections?: string[] };

/** Copy tuned per failure so the page never says "something went wrong". */
export const ERROR_COPY: Record<string, { title: string; body: string }> = {
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

/**
 * One tailoring session: generate, then compile what is on screen.
 *
 * Lifted out of the old dialog when tailoring became a page (ADR-015), with the
 * behaviour unchanged. The page decides what to show for each phase; this owns
 * the requests and the one rule that matters across them: a download compiles
 * the spec already shown and never generates again.
 */
export function useTailor({
  company,
  role,
  jobDescription,
  profile,
}: {
  company: string;
  role: string;
  jobDescription: string;
  profile: CvProfile;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TailorResponse | null>(null);
  const [cv, setCv] = useState<CvDocument | null>(null);
  const [origins, setOrigins] = useState<FactOrigins>(NO_ORIGINS);
  const [error, setError] = useState<TailorError | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const elapsed = useElapsed(loading);

  // The design the user picked in the gallery. Sent as the shape the renderer
  // needs rather than the id, so the private package never has to know the
  // catalogue — it depends on hono and nothing else.
  const style = templateStyle(templateConfig(profile.template));
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

  // The photo only matters if the chosen design emits one, so a template that
  // drops it costs no fetch at all.
  const files = () =>
    style.chrome.includes('photo') && profile.photo ? photoAsset(profile.photo) : null;

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      // The document is fetched alongside the generation, not after it: the
      // result is only worth showing next to what it is cited against, and
      // waiting for a second round trip would show it alone first.
      const photo = await files();
      const [res, cvDoc, factOrigins] = await Promise.all([
        apiFetch('/api/pro/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(photo ? { ...body, files: photo } : body),
        }),
        loadCvDocument(),
        loadFactOrigins(),
      ]);
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: TailorError } | null;
        setError(payload?.error ?? { code: 'UNKNOWN', message: `Request failed (${res.status}).` });
        return;
      }
      const payload = (await res.json()) as TailorResponse;
      setCv(cvDoc);
      setOrigins(factOrigins);
      // Rendering reduces and maps over `selected`. A response without it is a
      // server bug, but reading it off undefined throws during render and takes
      // the whole page down.
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
    // A retry starts clean, the way generate() does: otherwise a failure's
    // notice outlives it and sits over a download that then succeeded.
    setError(null);
    if (!result?.spec) {
      setError({
        code: 'UNKNOWN',
        message: 'This result cannot be compiled. Generate it again and retry the download.',
      });
      return;
    }
    setDownloading(true);
    try {
      const photo = await files();
      const res = await apiFetch('/api/pro/documents/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(photo ? { spec: result.spec, files: photo } : { spec: result.spec }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: TailorError } | null;
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

  const grounded = result !== null && cv !== null;
  const phase: 'idle' | 'generating' | 'review' | 'failed' = grounded
    ? 'review'
    : loading
      ? 'generating'
      : error
        ? 'failed'
        : 'idle';

  return {
    phase,
    result,
    cv,
    origins,
    error,
    clearError: () => setError(null),
    generate,
    downloadPdf,
    copyTex,
    regenerating: loading,
    downloading,
    copied,
    elapsed,
  };
}

/**
 * Whole seconds since `running` turned true, for an honest wait.
 *
 * Generation is one request with no progress events, so the page shows how
 * long it has been rather than steps it cannot observe. Real phases need a
 * streamed response (ADR-015, generation page).
 */
function useElapsed(running: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running) return;
    setSeconds(0);
    const started = Date.now();
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, [running]);
  return seconds;
}
