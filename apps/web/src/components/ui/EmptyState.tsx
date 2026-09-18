import type { ReactNode } from 'react';

interface EmptyStateProps {
  /** A single thin line glyph, ~22px. Lucide, at strokeWidth 1.5. */
  icon?: ReactNode;
  /** "No X yet" — name the thing that is missing, do not apologise for it. */
  title: string;
  /** One sentence on why the thing exists, not what the button does. */
  description: string;
  /** Exactly one primary action. A second CTA here is always a mistake. */
  action?: ReactNode;
}

/**
 * The empty-state formula: glyph, "No X yet", one line saying why it exists,
 * one primary action. No illustration, no secondary link competing with the
 * button.
 *
 * The padding is deliberately extravagant. An empty screen is the one place
 * where space is the entire design, and cramming it to look "less empty" is
 * what makes an empty state feel like a failure instead of a starting point.
 */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-16) var(--space-8)',
        gap: 'var(--space-3)',
        textAlign: 'center',
      }}
    >
      {icon && (
        <span
          style={{
            color: 'var(--color-text-tertiary)',
            display: 'inline-flex',
            marginBottom: 'var(--space-1)',
          }}
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      <p
        style={{
          fontSize: 'var(--text-sm)',
          fontWeight: 600,
          color: 'var(--color-text-primary)',
        }}
      >
        {title}
      </p>
      <p
        style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--color-text-secondary)',
          maxWidth: '380px',
          lineHeight: 1.6,
        }}
      >
        {description}
      </p>
      {action && <div style={{ marginTop: 'var(--space-3)' }}>{action}</div>}
    </div>
  );
}
