import type { ApplicationStatus } from '@jlog/shared';
import { Badge, type BadgeVariant } from './Badge';

interface StatusPillProps {
  status: ApplicationStatus;
}

const STATUS_VARIANTS: Record<ApplicationStatus, BadgeVariant> = {
  saved: 'info',
  applied: 'default',
  interviewing: 'warning',
  offer: 'success',
  rejected: 'danger',
  withdrawn: 'default',
};

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function StatusPill({ status }: StatusPillProps) {
  const variant: BadgeVariant = STATUS_VARIANTS[status] ?? 'default';
  return <Badge variant={variant}>{capitalise(status)}</Badge>;
}
