import type { ApplicationStatus } from '@jlog/shared';
import {
  AlertCircleIcon,
  ArrowRightIcon,
  BriefcaseIcon,
  FileUserIcon,
  HomeIcon,
  MessagesSquareIcon,
  SendIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { type CvProfile, isProfileUsable, loadCvProfile } from '../lib/cvProfile';
import { Sidebar } from './Sidebar';
import { BarList } from './charts/BarList';
import { Columns } from './charts/Columns';
import { TrendChart } from './charts/TrendChart';
import { EmptyState } from './ui/EmptyState';
import { JlogMark } from './ui/JlogMark';
import { Spinner } from './ui/Spinner';
import { Button } from './ui/button';

interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

type AuthState =
  | { status: 'loading' }
  | { status: 'authenticated'; user: User }
  | { status: 'unauthenticated' };

interface Overview {
  attention: { ghosted: number; awaiting: number; interviewing: number };
  funnel: { status: ApplicationStatus; count: number }[];
  sources: { source: string; count: number }[];
  overTime: { week: string; count: number }[];
  responseTime: { medianDays: number | null; buckets: { label: string; count: number }[] };
}

const SOURCE_LABELS: Record<string, string> = {
  linkedin: 'LinkedIn',
  ashby: 'Ashby',
  ashbyhq: 'Ashby',
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  wellfound: 'Wellfound',
  ycombinator: 'Y Combinator',
  personio: 'Personio',
  workday: 'Workday',
  smartrecruiters: 'SmartRecruiters',
  jobvite: 'Jobvite',
  icims: 'iCIMS',
  bamboohr: 'BambooHR',
  generic: 'AI extracted',
  manual: 'Manual',
};

/** "2026-38" → "Sep". Only the ends of the axis get labelled, so month is enough. */
function weekLabel(key: string): string {
  const [year, week] = key.split('-').map(Number);
  if (year == null || week == null) return '';
  const d = new Date(Date.UTC(year, 0, 1 + week * 7));
  return d.toLocaleDateString('en-US', { month: 'short' });
}

/** How long the arrival greeting holds before the dashboard takes over. */
const WELCOME_HOLD_MS = 2100;

export default function HomeShell() {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' });
  /*
   * Whether this page view is an arrival from sign-in rather than an ordinary
   * visit. Read once, in the initialiser, because the effect below removes the
   * query parameter immediately — a later read would always find it gone, and
   * a reload after that should not replay the greeting.
   */
  const [welcoming, setWelcoming] = useState(
    () =>
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('welcome') === '1',
  );
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [cv, setCv] = useState<CvProfile | null>(null);

  useEffect(() => {
    apiFetch('/api/auth/me')
      .then(async (res) => {
        if (!res.ok) {
          setAuth({ status: 'unauthenticated' });
          return;
        }
        const body = (await res.json()) as { user: User };
        setAuth({ status: 'authenticated', user: body.user });
      })
      .catch(() => setAuth({ status: 'unauthenticated' }));
  }, []);

  useEffect(() => {
    if (auth.status === 'unauthenticated') window.location.href = '/login';
  }, [auth.status]);

  useEffect(() => {
    if (!welcoming) return;
    // Out of the URL straight away, so a refresh or a shared link is just the
    // dashboard. replaceState rather than a navigation: nothing should reload.
    window.history.replaceState({}, '', '/dashboard');
    // Only start the clock once there is a name to greet, or someone on a slow
    // connection watches the greeting expire before their dashboard arrives.
    if (auth.status !== 'authenticated') return;
    const t = setTimeout(() => setWelcoming(false), WELCOME_HOLD_MS);
    return () => clearTimeout(t);
  }, [welcoming, auth.status]);

  useEffect(() => {
    if (auth.status !== 'authenticated') return;
    loadCvProfile()
      .then(setCv)
      .catch(() => {});
  }, [auth.status]);

  useEffect(() => {
    if (auth.status !== 'authenticated') return;
    apiFetch('/api/stats/overview')
      .then(async (res) => {
        if (!res.ok) return;
        setData((await res.json()) as Overview);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [auth.status]);

  async function handleSignOut() {
    await apiFetch('/api/auth/sign-out', { method: 'POST' });
    window.location.href = '/login';
  }

  if (auth.status === 'loading') {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--color-bg)',
        }}
      >
        <JlogMark mode="think" size={44} label="Loading" />
      </div>
    );
  }
  if (auth.status === 'unauthenticated') return null;

  /*
   * The arrival. Signing in used to end with a plain navigation: the provider
   * bounced you back and the dashboard was simply there, with nothing marking
   * the thing you had just been waiting for. This says it once, by name, and
   * then gets out of the way on a timer — there is nothing to dismiss and
   * nothing to click.
   */
  if (welcoming) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--space-5)',
          backgroundColor: 'var(--color-bg)',
          fontFamily: 'var(--font-sans)',
        }}
      >
        <JlogMark mode="tip" size={64} />
        <div style={{ textAlign: 'center' }}>
          <p
            style={{
              fontSize: 'var(--text-xl)',
              fontWeight: 650,
              color: 'var(--color-text-primary)',
              letterSpacing: '-0.01em',
            }}
          >
            Welcome back{auth.user.name ? `, ${auth.user.name.split(' ')[0]}` : ''}
          </p>
          <p
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-secondary)',
              marginTop: 'var(--space-1)',
            }}
          >
            Signed in as {auth.user.email}
          </p>
        </div>
      </div>
    );
  }

  const total = data?.funnel.reduce((n, f) => n + f.count, 0) ?? 0;

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        backgroundColor: 'var(--color-bg)',
        fontFamily: 'var(--font-sans)',
        color: 'var(--color-text-primary)',
      }}
    >
      <Sidebar user={auth.user} active="home" onSignOut={handleSignOut} />

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header
          style={{
            height: '56px',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 var(--space-8)',
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-secondary)',
            }}
          >
            <HomeIcon size={14} strokeWidth={1.75} style={{ color: 'var(--color-icon-home)' }} />
            Home
          </span>
          <Button size="sm" variant="outline" asChild>
            <a href="/applications">
              All applications
              <ArrowRightIcon size={14} strokeWidth={2} />
            </a>
          </Button>
        </header>

        {loading ? (
          <div style={{ padding: 'var(--space-16)', display: 'flex', justifyContent: 'center' }}>
            <Spinner />
          </div>
        ) : total === 0 ? (
          /* Rule 7: a cold account gets a way in, not seven zeroes and four
             empty charts. */
          <EmptyState
            icon={<BriefcaseIcon size={22} strokeWidth={1.5} />}
            title="Nothing tracked yet"
            description="Add your first application, or install the Chrome extension and jlog will capture them from LinkedIn, Greenhouse and Ashby as you apply."
            action={
              <Button size="sm" asChild>
                <a href="/applications">Add an application</a>
              </Button>
            }
          />
        ) : null}

        {!loading && total === 0 ? (
          <div style={{ padding: '0 var(--space-8) var(--space-16)' }}>
            <CvBand profile={cv} />
          </div>
        ) : (
          <main style={{ padding: '0 var(--space-8) var(--space-16)', width: '100%' }}>
            <AttentionStrip attention={data?.attention} />

            <CvBand profile={cv} />

            <Panel
              title="Applications added"
              caption="Last 26 weeks"
              value={String(total)}
              valueCaption="total"
            >
              <TrendChart
                points={(data?.overTime ?? []).map((w) => ({
                  label: weekLabel(w.week),
                  value: w.count,
                }))}
                unit="added"
              />
            </Panel>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                gap: 'var(--space-12)',
              }}
            >
              <Panel title="Pipeline" caption="Where everything stands">
                <BarList
                  rows={(data?.funnel ?? []).map((f) => ({
                    label: f.status.charAt(0).toUpperCase() + f.status.slice(1),
                    value: f.count,
                    dot: `var(--color-status-${f.status})`,
                    href: `/applications?status=${f.status}`,
                  }))}
                />
              </Panel>

              <Panel title="Where they came from" caption="By source">
                <BarList
                  rows={(data?.sources ?? []).slice(0, 7).map((s) => ({
                    label: SOURCE_LABELS[s.source] ?? s.source,
                    value: s.count,
                  }))}
                />
              </Panel>
            </div>

            <Panel
              title="How long replies take"
              caption="From applied to first response"
              value={
                data?.responseTime.medianDays != null ? `${data.responseTime.medianDays}d` : '—'
              }
              valueCaption="median"
            >
              {data?.responseTime.buckets.some((b) => b.count > 0) ? (
                // Capped, not full-bleed. Five 24px columns spread over 1200px
                // are five lonely marks; the shape of a distribution only reads
                // when the bars are near each other.
                <div style={{ maxWidth: '520px' }}>
                  <Columns
                    columns={data.responseTime.buckets.map((b) => ({
                      label: b.label,
                      value: b.count,
                    }))}
                  />
                </div>
              ) : (
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)' }}>
                  No replies recorded yet. This fills in as applications move out of Applied.
                </p>
              )}
            </Panel>
          </main>
        )}
      </div>
    </div>
  );
}

function Panel({
  title,
  caption,
  value,
  valueCaption,
  children,
}: {
  title: string;
  caption?: string;
  value?: string;
  valueCaption?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        paddingTop: 'var(--space-8)',
        paddingBottom: 'var(--space-8)',
        display: 'grid',
        gap: 'var(--space-6)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 'var(--space-4)',
        }}
      >
        <div style={{ display: 'grid', gap: '2px' }}>
          <h2
            style={{
              fontSize: 'var(--text-sm)',
              fontWeight: 600,
              letterSpacing: '-0.01em',
            }}
          >
            {title}
          </h2>
          {caption && (
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
              {caption}
            </p>
          )}
        </div>
        {value && (
          <div style={{ textAlign: 'right' }}>
            <div
              style={{
                fontSize: 'var(--text-2xl)',
                fontWeight: 500,
                letterSpacing: '-0.02em',
                lineHeight: 1,
              }}
            >
              {value}
            </div>
            {valueCaption && (
              <div
                style={{
                  fontSize: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.07em',
                  color: 'var(--color-text-tertiary)',
                  marginTop: '4px',
                }}
              >
                {valueCaption}
              </div>
            )}
          </div>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * CV readiness, on the home page.
 *
 * Loud only when it needs to be. Without a usable profile nothing can be
 * tailored, so that state gets a prompt with an action; once it is set up the
 * band collapses to a single quiet line, because a solved problem should not
 * keep asking for attention.
 */
function CvBand({ profile }: { profile: CvProfile | null }) {
  const ready = profile != null && isProfileUsable(profile);

  if (!ready) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-4)',
          flexWrap: 'wrap',
          padding: 'var(--space-5)',
          marginTop: 'var(--space-6)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
          <FileUserIcon
            size={18}
            strokeWidth={1.5}
            style={{ color: 'var(--color-icon-cv)', flexShrink: 0, marginTop: '2px' }}
          />
          <div style={{ display: 'grid', gap: '2px' }}>
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>Set up your CV</span>
            <span
              style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--color-text-secondary)',
                maxWidth: '58ch',
                lineHeight: 1.6,
              }}
            >
              Import a CV once and every tailored CV and cover letter is built from it. Until then,
              tailoring has nothing to draw on.
            </span>
          </div>
        </div>
        <Button size="sm" asChild>
          <a href="/cv">Import your CV</a>
        </Button>
      </div>
    );
  }

  const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ');

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-4)',
        flexWrap: 'wrap',
        paddingTop: 'var(--space-5)',
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          fontSize: 'var(--text-sm)',
          color: 'var(--color-text-secondary)',
        }}
      >
        <FileUserIcon size={14} strokeWidth={1.75} style={{ color: 'var(--color-icon-cv)' }} />
        CV ready — {name}
        {profile.title && `, ${profile.title}`}
      </span>
      <Button variant="ghost" size="sm" asChild>
        <a href="/cv">
          Tweak your CV
          <ArrowRightIcon size={13} strokeWidth={2} />
        </a>
      </Button>
    </div>
  );
}

function AttentionStrip({ attention }: { attention: Overview['attention'] | undefined }) {
  const tiles = [
    {
      label: 'Ghosted',
      hint: 'Applied over 14 days ago, still silent',
      value: attention?.ghosted ?? 0,
      Icon: AlertCircleIcon,
      tone: 'var(--color-warning)',
      href: '/applications?view=ghosted',
    },
    {
      label: 'Awaiting response',
      hint: 'Applied within the last 14 days',
      value: attention?.awaiting ?? 0,
      Icon: SendIcon,
      tone: 'var(--color-text-tertiary)',
      href: '/applications?status=applied',
    },
    {
      label: 'In interview',
      hint: 'Conversations currently open',
      value: attention?.interviewing ?? 0,
      Icon: MessagesSquareIcon,
      tone: 'var(--color-status-interviewing)',
      href: '/applications?status=interviewing',
    },
  ];

  return (
    /*
     * Staggered: these three are the first thing on the dashboard and they
     * arrive together once the overview lands, so they read as a row being
     * dealt rather than as a block appearing. Three is comfortably inside the
     * six-item cap the gesture stops delaying past.
     */
    <div
      className="jlog-stagger"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 'var(--space-4)',
        paddingTop: 'var(--space-2)',
        paddingBottom: 'var(--space-8)',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      {tiles.map(({ label, hint, value, Icon, tone, href }) => (
        <a
          key={label}
          href={href}
          style={{
            display: 'grid',
            gap: 'var(--space-2)',
            padding: 'var(--space-4) var(--space-5)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-secondary)',
            }}
          >
            <Icon size={13} strokeWidth={1.75} style={{ color: tone }} />
            {label}
          </span>
          <span
            style={{
              fontSize: 'var(--text-3xl)',
              fontWeight: 500,
              letterSpacing: '-0.02em',
              lineHeight: 1,
            }}
          >
            {value}
          </span>
          <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>{hint}</span>
        </a>
      ))}
    </div>
  );
}
