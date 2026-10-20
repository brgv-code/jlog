import { templateConfig, templateStyle } from '@jlog/shared';
import { useEffect, useRef, useState } from 'react';
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
import { updateFact } from './facts';
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

/** A line of the tailored CV, by role and position. */
export type LineRef = { role: number; bullet: number };
type LineAction = 'like' | 'dislike' | 'regenerate' | 'remove' | 'edit';
export type LineOutcome = { ok: true } | { ok: false; reason: string; unsupported: string[] };

/**
 * What the owner can do to one line (ADR-015). Every action is recorded; like
 * and dislike steer which wordings tailoring offers next time.
 */
export type LineActions = {
  like: (ref: LineRef) => void;
  dislike: (ref: LineRef, reason: string) => void;
  remove: (ref: LineRef) => void;
  /** One new wording of the same fact, avoiding every one rejected. */
  regenerate: (ref: LineRef) => Promise<LineOutcome>;
  /** The owner's words, checked against their facts and never rewritten. */
  edit: (ref: LineRef, text: string) => Promise<LineOutcome>;
  /** The owner vouches for the new words: the fact itself now says this. */
  rewriteFact: (ref: LineRef, text: string) => Promise<boolean>;
};

type SavedTailored = {
  spec: unknown;
  selected: SelectedRole[];
  reasoning?: string;
  tex?: string;
};

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
  applicationId,
  company,
  role,
  jobDescription,
  profile,
}: {
  applicationId: string;
  company: string;
  role: string;
  jobDescription: string;
  profile: CvProfile;
}) {
  const [restoring, setRestoring] = useState(true);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  /** Wordings the owner rejected this session, per fact, so a regenerate steers away from all of them. */
  const rejected = useRef(new Map<string, string[]>());
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

  // Reopening shows what was last tailored for this application, with no model
  // call: waiting for a generation every visit was the slowest part of tailoring.
  useEffect(() => {
    let live = true;
    Promise.all([
      apiFetch(`/api/applications/${encodeURIComponent(applicationId)}/tailored`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null) as Promise<{
        tailored: (SavedTailored & { savedAt: string }) | null;
      } | null>,
      loadCvDocument(),
      loadFactOrigins(),
    ])
      .then(([saved, cvDoc, factOrigins]) => {
        if (!live) return;
        setCv(cvDoc);
        setOrigins(factOrigins);
        const t = saved?.tailored;
        if (t?.spec && Array.isArray(t.selected)) {
          setResult({
            spec: t.spec,
            selected: t.selected,
            tex: t.tex ?? '',
            ...(t.reasoning ? { reasoning: t.reasoning } : {}),
            attempts: 1,
            corrections: [],
          });
          setSavedAt(t.savedAt);
        }
      })
      .finally(() => {
        if (live) setRestoring(false);
      });
    return () => {
      live = false;
    };
  }, [applicationId]);

  /** Keep what is on screen, so reopening shows it. A failed save is said, not hidden. */
  async function persist(next: TailorResponse) {
    const res = await apiFetch(`/api/applications/${encodeURIComponent(applicationId)}/tailored`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        spec: next.spec,
        selected: next.selected,
        tex: next.tex,
        ...(next.reasoning ? { reasoning: next.reasoning } : {}),
      }),
    }).catch(() => null);
    if (res?.ok) setSavedAt(new Date().toISOString());
    else
      setError({
        code: 'SAVE_FAILED',
        message: 'This CV could not be saved. It is still on screen.',
      });
  }

  function record(
    ref: LineRef,
    action: LineAction,
    extra: { reason?: string; after?: string } = {},
  ) {
    const b = result?.selected[ref.role]?.bullets[ref.bullet];
    if (!b) return;
    apiFetch('/api/profile/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        applicationId,
        factId: b.factId,
        ...(b.variantId ? { variantId: b.variantId } : {}),
        action,
        before: b.text,
        ...extra,
      }),
    }).catch(() => {});
  }

  /** Change one line in both the lines and the spec, then keep the result. */
  function patchLine(
    ref: LineRef,
    next: { text: string; variantId?: string; check?: 'reworded' } | null,
  ) {
    if (!result) return;
    const selected = result.selected.map((r, i) =>
      i !== ref.role
        ? r
        : {
            ...r,
            bullets: r.bullets.flatMap((b, j) => {
              if (j !== ref.bullet) return [b];
              if (!next) return [];
              // The check that produced the old line no longer describes the new one.
              return [
                {
                  factId: b.factId,
                  text: next.text,
                  ...(next.variantId ? { variantId: next.variantId } : {}),
                  ...(next.check ? { check: next.check } : {}),
                  ...(b.jd ? { jd: b.jd } : {}),
                },
              ];
            }),
          },
    );
    const spec = result.spec as {
      experience: { bullets: { factId: string; variantId?: string }[] }[];
    };
    const nextSpec = {
      ...spec,
      experience: spec.experience.map((e, i) =>
        i !== ref.role
          ? e
          : {
              ...e,
              bullets: e.bullets.flatMap((b, j) => {
                if (j !== ref.bullet) return [b];
                if (!next) return [];
                return [
                  { factId: b.factId, ...(next.variantId ? { variantId: next.variantId } : {}) },
                ];
              }),
            },
      ),
    };
    const updated = { ...result, selected, spec: nextSpec };
    setResult(updated);
    void persist(updated);
  }

  async function applyLine(
    ref: LineRef,
    res: Response | null,
    action: 'regenerate' | 'edit',
  ): Promise<LineOutcome> {
    if (!res) return { ok: false, reason: 'Could not reach the API.', unsupported: [] };
    const payload = (await res.json().catch(() => null)) as {
      status?: string;
      text?: string;
      variantId?: string;
      reason?: string;
      unsupported?: string[];
      error?: TailorError;
    } | null;
    if (!res.ok || !payload) {
      return {
        ok: false,
        reason: payload?.error?.message ?? 'That did not work.',
        unsupported: [],
      };
    }
    if (payload.status === 'fell-back' || !payload.text || !payload.variantId) {
      return {
        ok: false,
        reason: payload.reason ?? 'Not backed by your facts.',
        unsupported: payload.unsupported ?? [],
      };
    }
    record(ref, action, { after: payload.text });
    // A rewrite passed the same check as tailoring, so it is labelled the same;
    // the owner's own edit is theirs and needs no label.
    patchLine(ref, {
      text: payload.text,
      variantId: payload.variantId,
      ...(action === 'regenerate' ? { check: 'reworded' as const } : {}),
    });
    return { ok: true };
  }

  const bulletAt = (ref: LineRef) => result?.selected[ref.role]?.bullets[ref.bullet];

  const lines: LineActions = {
    like(ref) {
      record(ref, 'like');
    },
    dislike(ref, reason) {
      const b = bulletAt(ref);
      if (b) rejected.current.set(b.factId, [...(rejected.current.get(b.factId) ?? []), b.text]);
      record(ref, 'dislike', { reason });
    },
    remove(ref) {
      record(ref, 'remove');
      patchLine(ref, null);
    },
    async regenerate(ref) {
      const b = bulletAt(ref);
      if (!b) return { ok: false, reason: 'That line is gone.', unsupported: [] };
      const res = await apiFetch('/api/pro/lines/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          factId: b.factId,
          ...(b.variantId ? { variantId: b.variantId } : {}),
          current: b.text,
          jobDescription,
          avoid: rejected.current.get(b.factId) ?? [],
          targetRole: role,
          targetCompany: company,
        }),
      }).catch(() => null);
      return applyLine(ref, res, 'regenerate');
    },
    async edit(ref, text) {
      const b = bulletAt(ref);
      if (!b) return { ok: false, reason: 'That line is gone.', unsupported: [] };
      const res = await apiFetch('/api/pro/lines/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          factId: b.factId,
          ...(b.variantId ? { variantId: b.variantId } : {}),
          current: b.text,
          text,
        }),
      }).catch(() => null);
      return applyLine(ref, res, 'edit');
    },
    async rewriteFact(ref, text) {
      const b = bulletAt(ref);
      if (!b) return false;
      if (!(await updateFact(b.factId, { canonical: text }))) return false;
      record(ref, 'edit', { after: text, reason: 'fact updated' });
      // The fact now says this, and its old phrasings went with the edit.
      patchLine(ref, { text });
      return true;
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
      const next = { ...payload, selected: payload.selected ?? [] };
      setResult(next);
      rejected.current.clear();
      void persist(next);
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
  const phase: 'restoring' | 'idle' | 'generating' | 'review' | 'failed' = restoring
    ? 'restoring'
    : grounded
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
    savedAt,
    lines,
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
