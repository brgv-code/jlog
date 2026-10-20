import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  FileTextIcon,
  SparklesIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { useBillingEnabled } from '../../lib/billing';
import { type CvProfile, EMPTY_PROFILE, isProfileUsable, loadCvProfile } from '../../lib/cvProfile';
import { loginUrlFor } from '../../lib/next';
import { usePageTitle } from '../../lib/usePageTitle';
import { ERROR_COPY, useTailor } from '../../lib/useTailor';
import { Sidebar } from '../Sidebar';
import { JlogMark } from '../ui/JlogMark';
import { Button } from '../ui/button';
import { GroundedCvView } from './GroundedCvView';

interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

interface Application {
  id: string;
  company: string;
  role: string;
  jobDescription: string | null;
}

type Load =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'missing' }
  | { status: 'ready'; user: User; app: Application; profile: CvProfile };

/**
 * Tailoring as a page of its own (ADR-015), at `/applications/cv?id=…`.
 *
 * It used to be a dialog over the application. The work outgrew it: a result is
 * read line by line against two documents, and the steps ADR-015 adds after this
 * one (questions about gaps, editing a line, feedback, chat) each need room a
 * modal does not have. A page also gives the session an address to come back to.
 */
export default function TailorPage() {
  const [load, setLoad] = useState<Load>({ status: 'loading' });

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('id');
    (async () => {
      const me = await apiFetch('/api/auth/me').catch(() => null);
      if (!me?.ok) return setLoad({ status: 'unauthenticated' });
      const { user } = (await me.json()) as { user: User };
      if (!id) return setLoad({ status: 'missing' });
      const [res, profile] = await Promise.all([
        apiFetch(`/api/applications/${encodeURIComponent(id)}`).catch(() => null),
        loadCvProfile().catch(() => EMPTY_PROFILE),
      ]);
      if (!res?.ok) return setLoad({ status: 'missing' });
      const { application } = (await res.json()) as { application: Application };
      setLoad({ status: 'ready', user, app: application, profile });
    })().catch(() => setLoad({ status: 'missing' }));
  }, []);

  useEffect(() => {
    if (load.status === 'unauthenticated') window.location.href = loginUrlFor(window.location);
  }, [load.status]);

  usePageTitle(load.status === 'ready' ? `CV for ${load.app.company}` : null);

  async function signOut() {
    await apiFetch('/api/auth/sign-out', { method: 'POST' });
    window.location.href = '/login';
  }

  if (load.status === 'loading' || load.status === 'unauthenticated') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        {load.status === 'loading' && <JlogMark mode="think" size={44} label="Loading" />}
      </div>
    );
  }

  if (load.status === 'missing') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center">
        <p className="text-sm font-medium">This application could not be found</p>
        <p className="text-muted-foreground text-[13px]">
          It may have been deleted, or the link is missing its id.
        </p>
        <Button variant="outline" size="sm" asChild>
          <a href="/applications">
            <ArrowLeftIcon /> Applications
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar user={load.user} active="applications" onSignOut={signOut} />
      <div className="flex h-screen min-w-0 flex-1 flex-col">
        <Workspace app={load.app} profile={load.profile} />
      </div>
    </div>
  );
}

function Workspace({ app, profile }: { app: Application; profile: CvProfile }) {
  const jobDescription = app.jobDescription ?? '';
  const t = useTailor({ company: app.company, role: app.role, jobDescription, profile });
  const billingEnabled = useBillingEnabled();
  const back = `/applications?id=${encodeURIComponent(app.id)}`;

  // Stated as the specific missing thing with the action that fixes it. A
  // disabled button with no reason is the worst version of this.
  const blocker = !jobDescription.trim()
    ? {
        text: 'Add a job description to the application to tailor against it.',
        href: back,
        cta: 'Open the application',
      }
    : !isProfileUsable(profile)
      ? {
          text: 'Add your name and contact details to build a CV header.',
          href: '/settings',
          cta: 'Settings',
        }
      : null;

  if (t.phase === 'review' && t.result && t.cv) {
    // A failure during regenerate or compile happens with a result already on
    // screen; it goes to the view as a line it can show.
    const notice = t.error ? (ERROR_COPY[t.error.code]?.title ?? t.error.message) : null;
    return (
      <>
        <Crumbs back={back} company={app.company} role={app.role} />
        <div className="min-h-0 flex-1">
          <GroundedCvView
            company={app.company}
            role={app.role}
            jobDescription={jobDescription}
            selected={t.result.selected}
            cv={t.cv}
            origins={t.origins}
            {...(t.result.reasoning ? { reasoning: t.result.reasoning } : {})}
            attempts={t.result.attempts}
            onRegenerate={t.generate}
            onDownload={t.downloadPdf}
            onCopyTex={t.copyTex}
            regenerating={t.regenerating}
            downloading={t.downloading}
            copied={t.copied}
            notice={notice}
            onDismissNotice={t.clearError}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <Crumbs back={back} company={app.company} role={app.role} />
      <main className="flex-1 overflow-y-auto px-6 py-10">
        <div className="mx-auto max-w-xl">
          {t.phase === 'idle' && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="rounded-full border border-border bg-muted/40 p-3">
                <FileTextIcon className="size-5 text-muted-foreground" />
              </div>
              <div className="max-w-sm space-y-1.5">
                <p className="text-sm font-medium">Build a CV for this posting</p>
                <p className="text-muted-foreground text-[13px] leading-relaxed">
                  {blocker
                    ? blocker.text
                    : 'Your stored facts are matched against the posting and lightly reworded toward it. Every reworded line is checked against your facts, and you will see which ones kept your own wording, and why.'}
                </p>
              </div>
              {blocker ? (
                <Button variant="outline" asChild>
                  <a href={blocker.href}>
                    {blocker.cta} <ArrowRightIcon />
                  </a>
                </Button>
              ) : (
                <Button onClick={t.generate} className="mt-1">
                  <SparklesIcon /> Generate
                </Button>
              )}
            </div>
          )}

          {t.phase === 'generating' && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <JlogMark mode="think" size={36} label="Tailoring" />
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Tailoring your CV</p>
                <p className="text-muted-foreground text-[13px] leading-relaxed">
                  Choosing lines from your profile, rewording them toward the posting, then checking
                  every reworded line against your facts. This usually takes 20 to 30 seconds.
                </p>
              </div>
              <p
                className="text-muted-foreground font-mono text-[12px] tabular-nums"
                aria-live="off"
              >
                {t.elapsed}s
              </p>
            </div>
          )}

          {t.phase === 'failed' && t.error && (
            <div className="space-y-3">
              <div className="flex gap-3 rounded-lg border border-destructive/25 bg-destructive/[0.07] px-4 py-3.5">
                <AlertTriangleIcon className="text-destructive mt-0.5 size-4 shrink-0" />
                <div className="space-y-1">
                  <p className="text-[13px] font-medium">
                    {ERROR_COPY[t.error.code]?.title ?? 'Could not tailor this CV'}
                  </p>
                  <p className="text-muted-foreground text-[13px] leading-relaxed">
                    {ERROR_COPY[t.error.code]?.body ?? t.error.message}
                  </p>
                  {ERROR_COPY[t.error.code] && t.error.message ? (
                    <p className="text-muted-foreground/70 pt-0.5 font-mono text-[11px] leading-relaxed break-words">
                      {t.error.message}
                    </p>
                  ) : null}
                </div>
              </div>
              {t.error.corrections?.length ? (
                <ul className="text-muted-foreground space-y-1 rounded-lg border border-border bg-muted/30 px-4 py-3 font-mono text-[11px] leading-relaxed">
                  {t.error.corrections.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              ) : null}
              {/* Retrying a 402 can only fail again: the account is not
                  entitled, and the fix is upstream of this page. Where nothing
                  is for sale (a self-hosted build) there is no action at all. */}
              {t.error.code === 'PRO_REQUIRED' ? (
                billingEnabled ? (
                  <Button size="sm" asChild>
                    <a href="/settings">Upgrade to Pro</a>
                  </Button>
                ) : null
              ) : (
                <Button variant="outline" size="sm" onClick={t.generate}>
                  Try again
                </Button>
              )}
            </div>
          )}
        </div>
      </main>
    </>
  );
}

function Crumbs({ back, company, role }: { back: string; company: string; role: string }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex flex-none items-center gap-2 border-b border-border px-5 py-2.5 text-[12.5px]"
    >
      <a href="/applications" className="text-muted-foreground hover:text-foreground">
        Applications
      </a>
      <span className="text-muted-foreground/60">/</span>
      <a href={back} className="text-muted-foreground hover:text-foreground truncate">
        {role}, {company}
      </a>
      <span className="text-muted-foreground/60">/</span>
      <span className="font-medium">CV</span>
    </nav>
  );
}
