import type * as React from 'react';
import { cn } from '../../lib/utils';

/**
 * A sweeping highlight rather than a pulse. Tailoring takes several seconds of
 * real model work, and a pulse at that duration reads as a stalled page.
 *
 * The sweep is `.jlog-sweep` from `styles/motion.css`, which is what the design
 * system documents this as. It used to be Tailwind's own `animate-shimmer`,
 * with its own duration and curve — so the one place the gesture actually ran
 * was the one place not governed by the motion tokens.
 */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('bg-muted relative overflow-hidden rounded-md', className)}
      {...props}
    >
      <div className="jlog-sweep absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
    </div>
  );
}

export { Skeleton };
