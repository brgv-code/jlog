import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { Spinner } from '../ui/Spinner';

interface AppEvent {
  id: string;
  applicationId: string;
  type: 'created' | 'status_change' | 'note_added' | 'follow_up_sent';
  payload: unknown;
  createdAt: string;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
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

function dotColor(type: AppEvent['type']): string {
  if (type === 'created') return 'var(--color-success)';
  if (type === 'status_change') return 'var(--color-accent)';
  if (type === 'follow_up_sent') return 'var(--color-info)';
  return 'var(--color-warning)';
}

interface TimelineProps {
  applicationId: string;
}

export function Timeline({ applicationId }: TimelineProps) {
  const [appEvents, setAppEvents] = useState<AppEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/api/applications/${applicationId}/events`)
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { events: AppEvent[] };
        // Show newest first
        setAppEvents([...data.events].reverse());
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [applicationId]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-4)' }}>
        <Spinner size={16} />
      </div>
    );
  }

  if (appEvents.length === 0) {
    return (
      <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)' }}>
        No activity yet
      </p>
    );
  }

  return (
    <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
      {appEvents.map((event, idx) => {
        const isLast = idx === appEvents.length - 1;
        return (
          <li
            key={event.id}
            style={{
              display: 'flex',
              gap: 'var(--space-3)',
              position: 'relative',
            }}
          >
            {/* Left column: dot + vertical line */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                flexShrink: 0,
                width: '16px',
              }}
            >
              <div
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: dotColor(event.type),
                  marginTop: '5px',
                  flexShrink: 0,
                }}
              />
              {!isLast && (
                <div
                  style={{
                    width: '1px',
                    flexGrow: 1,
                    backgroundColor: 'var(--color-border)',
                    marginTop: '4px',
                    marginBottom: '4px',
                    minHeight: '16px',
                  }}
                />
              )}
            </div>

            {/* Right column: content */}
            <div style={{ paddingBottom: isLast ? 0 : 'var(--space-4)', flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 'var(--text-sm)',
                  fontWeight: 500,
                  color: 'var(--color-text-primary)',
                }}
              >
                {eventLabel(event.type)}
              </div>
              {eventDetail(event) && (
                <div
                  style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-text-secondary)',
                    marginTop: '2px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {eventDetail(event)}
                </div>
              )}
              <div
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-text-tertiary)',
                  marginTop: '2px',
                }}
              >
                {formatTimestamp(event.createdAt)}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
