import type * as React from 'react';
import { cn } from '../../lib/utils';

/**
 * A sweeping highlight rather than a pulse. Tailoring takes several seconds of
 * real model work, and a pulse at that duration reads as a stalled page.
 */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('bg-muted relative overflow-hidden rounded-md', className)}
      {...props}
    >
      <div className="animate-shimmer absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
    </div>
  );
}

export { Skeleton };
