import type { ApplicationStatus } from '@jlog/shared';
import { Badge } from './Badge';

/**
 * Application status is the one flow in jlog that earns a palette (design
 * direction, rule 3). Every other surface stays greyscale, which is what makes
 * these six readable at a glance in a table of otherwise neutral text.
 */
const STATUS_TONES: Record<ApplicationStatus, string> = {
  saved: 'var(--color-status-saved)',
  applied: 'var(--color-status-applied)',
  interviewing: 'var(--color-status-interviewing)',
  offer: 'var(--color-status-offer)',
  rejected: 'var(--color-status-rejected)',
  withdrawn: 'var(--color-status-withdrawn)',
};

interface StatusPillProps {
  status: ApplicationStatus;
  /**
   * Whether this status was *just changed by the user*, as opposed to being the
   * value the pill happened to mount with.
   *
   * It is a prop rather than something this component works out for itself, and
   * that is the whole fix: an earlier version compared against a ref of the
   * previous status and skipped the first mount, which was correct reasoning
   * applied to the wrong component. `StatusSelect` swaps between three
   * different element trees while saving, so every one of those rendered a
   * brand-new pill, the ref started empty each time, and the animation it was
   * guarding never ran once for a real change.
   *
   * The caller that knows a transition happened is the one that performed it.
   */
  changed?: boolean;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function StatusPill({ status, changed = false }: StatusPillProps) {
  const tone = STATUS_TONES[status] ?? 'var(--color-status-applied)';

  // An offer gets the celebration reserved for it — the one unambiguously good
  // thing that happens here — and takes that *instead of* settling, since two
  // scale animations on one element fight each other.
  if (changed && status === 'offer') {
    return (
      <span style={{ position: 'relative', display: 'inline-flex' }}>
        {/* Expands away once and is gone. Hidden from assistive tech: the
            status text beside it already carries the news. */}
        <span
          aria-hidden="true"
          className="jlog-burst-ring"
          style={{
            position: 'absolute',
            inset: '-2px',
            borderRadius: 'var(--radius-full)',
            border: '2px solid var(--color-status-offer)',
            pointerEvents: 'none',
          }}
        />
        <span className="jlog-burst" style={{ display: 'inline-block' }}>
          <Badge tone={tone}>{capitalise(status)}</Badge>
        </span>
      </span>
    );
  }

  return (
    <span className={changed ? 'jlog-settle' : undefined} style={{ display: 'inline-block' }}>
      <Badge tone={tone}>{capitalise(status)}</Badge>
    </span>
  );
}
