import type { ApplicationStatus } from '@jlog/shared';
import { PlusIcon, SendIcon, StickyNoteIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { Spinner } from '../ui/Spinner';

interface AppEvent {
  id: string;
  applicationId: string;
  type: 'created' | 'status_change' | 'note_added' | 'follow_up_sent';
  payload: unknown;
  createdAt: string;
}

const STATUS_TONES: Record<ApplicationStatus, string> = {
  saved: 'var(--color-status-saved)',
  applied: 'var(--color-status-applied)',
  interviewing: 'var(--color-status-interviewing)',
  offer: 'var(--color-status-offer)',
  rejected: 'var(--color-status-rejected)',
  withdrawn: 'var(--color-status-withdrawn)',
};

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * The short form shown in the feed: a time for today, a day for this year, a
 * full date otherwise. The full timestamp is one hover away, which is where it
 * belongs in a feed you scan rather than read.
 */
function formatShort(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}

function eventLabel(type: AppEvent['type']): string {
  if (type === 'created') return 'Application created';
  if (type === 'status_change') return 'Status changed';
  if (type === 'follow_up_sent') return 'Follow-up sent';
  return 'Note added';
}

function parsePayload(raw: unknown): Record<string, unknown> {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  return {};
}

function eventDetail(event: AppEvent): string {
  const p = parsePayload(event.payload);
  if (event.type === 'created') {
    return `${String(p.company ?? '')} — ${String(p.role ?? '')}`;
  }
  if (event.type === 'status_change') {
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    return `${cap(String(p.from ?? ''))} → ${cap(String(p.to ?? ''))}`;
  }
  if (event.type === 'follow_up_sent') {
    const channel = String(p.channel ?? '');
    return channel === 'whatsapp' ? 'via WhatsApp' : 'via email';
  }
  const preview = String(p.preview ?? '');
  return preview ? `"${preview}${preview.length >= 80 ? '…' : ''}"` : '';
}

/**
 * The glyph for each kind of event. Greyscale, except a status change, which
 * takes the ink of the status it moved to: status is the one flow that earns a
 * palette, and here it is the actual news of the row.
 */
function EventGlyph({ event }: { event: AppEvent }) {
  if (event.type === 'status_change') {
    const to = String(parsePayload(event.payload).to ?? '') as ApplicationStatus;
    return (
      <span
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: STATUS_TONES[to] ?? 'var(--color-text-tertiary)',
        }}
      />
    );
  }
  const Icon =
    event.type === 'created'
      ? PlusIcon
      : event.type === 'follow_up_sent'
        ? SendIcon
        : StickyNoteIcon;
  return <Icon size={11} strokeWidth={2} />;
}

interface TimelineProps {
  applicationId: string;
  /** Bump to refetch, after something on the page has added an event. */
  refreshKey?: number;
}

/**
 * What has happened to the application, oldest first, so it reads downward
 * like the story it is and ends at the composer where the next entry is
 * written.
 */
export function Timeline({ applicationId, refreshKey = 0 }: TimelineProps) {
  const [appEvents, setAppEvents] = useState<AppEvent[]>([]);
  const [loading, setLoading] = useState(true);
  /*
   * Only an event that arrives *after* the first load rises in. The feed itself
   * arrives with the page, and re-animating rows that were already there would
   * say they changed when they did not.
   */
  const known = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());

  // Declared before the fetch so a new application starts from a clean slate.
  // biome-ignore lint/correctness/useExhaustiveDependencies: applicationId is the reset trigger, not a value read here
  useEffect(() => {
    known.current = null;
    setLoading(true);
  }, [applicationId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey is the refetch trigger
  useEffect(() => {
    apiFetch(`/api/applications/${applicationId}/events`)
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { events: AppEvent[] };
        const prev = known.current;
        setFresh(new Set(prev ? data.events.filter((e) => !prev.has(e.id)).map((e) => e.id) : []));
        known.current = new Set(data.events.map((e) => e.id));
        setAppEvents(data.events);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [applicationId, refreshKey]);

  if (loading) {
    return (
      <div style={{ padding: 'var(--space-2) 0' }}>
        <Spinner size={14} />
      </div>
    );
  }

  if (appEvents.length === 0) {
    return (
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
        No activity yet
      </p>
    );
  }

  return (
    <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {appEvents.map((event, idx) => {
        const isLast = idx === appEvents.length - 1;
        const detail = eventDetail(event);
        const isNew = fresh.has(event.id);
        return (
          <li
            key={event.id}
            className={isNew ? 'jlog-rise' : undefined}
            style={{
              position: 'relative',
              display: 'grid',
              gridTemplateColumns: '20px minmax(0, 1fr)',
              columnGap: 'var(--space-3)',
              paddingBottom: isLast ? 0 : 'var(--space-5)',
            }}
          >
            {/* The thread joining this row to the next. */}
            {!isLast && (
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: '9.5px',
                  top: '24px',
                  bottom: '4px',
                  width: '1px',
                  backgroundColor: 'var(--color-border)',
                }}
              />
            )}
            <span
              aria-hidden="true"
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-bg)',
                color: 'var(--color-text-secondary)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <EventGlyph event={event} />
            </span>

            <div style={{ minWidth: 0, fontSize: 'var(--text-sm)', lineHeight: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)' }}>
                <p style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>
                    {eventLabel(event.type)}
                  </span>
                  {detail && event.type !== 'note_added' && (
                    <span style={{ color: 'var(--color-text-secondary)' }}> {detail}</span>
                  )}
                </p>
                <time
                  dateTime={event.createdAt}
                  title={formatTimestamp(event.createdAt)}
                  style={{
                    flexShrink: 0,
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-text-secondary)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {formatShort(event.createdAt)}
                </time>
              </div>
              {/* A note is the one event with something to read, so it gets
                  room to be read instead of an ellipsis. */}
              {detail && event.type === 'note_added' && (
                <p
                  style={{
                    marginTop: 'var(--space-2)',
                    padding: 'var(--space-2) var(--space-3)',
                    borderLeft: '2px solid var(--color-border-strong)',
                    color: 'var(--color-text-secondary)',
                    lineHeight: 1.6,
                    overflowWrap: 'anywhere',
                  }}
                >
                  {detail}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
