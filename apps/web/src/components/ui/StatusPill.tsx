import type { ApplicationStatus } from '@jlog/shared';
import { useEffect, useRef, useState } from 'react';
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
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * The pill, and the one place a status change is actually visible.
 *
 * It settles into its new colour rather than swapping, and an offer gets the
 * celebration reserved for it — the one unambiguously good thing that happens
 * in this app, and the only event marked without the user having clicked
 * something to cause it.
 *
 * Both fire on a *change* and never on first mount. A table of forty rows
 * animating every pill on arrival would be exactly the restlessness the motion
 * rules exist to prevent: `settle` says "this became something else", which is
 * a claim you can only make about a value that was already on screen.
 */
export function StatusPill({ status }: StatusPillProps) {
  const previous = useRef<ApplicationStatus | null>(null);
  // Bumped only on a real transition; used as a key so the animation replays
  // rather than being ignored as already-run.
  const [changeNonce, setChangeNonce] = useState(0);
  const [changedTo, setChangedTo] = useState<ApplicationStatus | null>(null);

  useEffect(() => {
    if (previous.current !== null && previous.current !== status) {
      setChangedTo(status);
      setChangeNonce((n) => n + 1);
    }
    previous.current = status;
  }, [status]);

  const justChanged = changedTo === status;
  const celebrating = justChanged && status === 'offer';

  const pill = (
    <span
      key={changeNonce}
      className={justChanged ? 'jlog-settle' : undefined}
      style={{ display: 'inline-block' }}
    >
      <Badge tone={STATUS_TONES[status] ?? 'var(--color-status-applied)'}>
        {capitalise(status)}
      </Badge>
    </span>
  );

  if (!celebrating) return pill;

  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      {/* The ring expands away once and is gone. `aria-hidden` because the
          status text beside it already carries the news. */}
      <span
        key={`ring-${changeNonce}`}
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
      <span key={`burst-${changeNonce}`} className="jlog-burst" style={{ display: 'inline-block' }}>
        <Badge tone={STATUS_TONES.offer}>{capitalise(status)}</Badge>
      </span>
    </span>
  );
}
