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
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function StatusPill({ status }: StatusPillProps) {
  return (
    <Badge tone={STATUS_TONES[status] ?? 'var(--color-status-applied)'}>{capitalise(status)}</Badge>
  );
}
