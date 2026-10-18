import type { CSSProperties, ReactNode } from 'react';

export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info';

const VARIANT_TOKENS: Record<BadgeVariant, string> = {
  default: 'var(--color-text-secondary)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  danger: 'var(--color-danger)',
  info: 'var(--color-info)',
};

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant | undefined;
  /**
   * A colour to use directly, for palettes that are not the generic semantic
   * five — application status being the one that matters. Wins over `variant`.
   */
  tone?: string | undefined;
}

/**
 * Ink on a wash of itself.
 *
 * One token drives both halves via color-mix, so a badge cannot end up with a
 * fill that has drifted from its text — which is exactly what happened when
 * the five colours were hand-written hex pairs tuned for the dark theme, and
 * then bled onto white.
 */
export function Badge({ children, variant = 'default', tone }: BadgeProps) {
  const ink = tone ?? VARIANT_TOKENS[variant];
  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    fontSize: 'var(--text-xs)',
    fontWeight: 500,
    lineHeight: 1,
    padding: '3px 8px',
    borderRadius: 'var(--radius-full)',
    // The ink alone sits right on 4.5:1 against its own wash, and drops under
    // it on the off-white rail. Pulling it toward the theme's text colour
    // darkens it on light and lightens it on dark, keeping the hue readable.
    color: `color-mix(in srgb, ${ink} 70%, var(--color-text-primary))`,
    backgroundColor: `color-mix(in srgb, ${ink} 10%, transparent)`,
    whiteSpace: 'nowrap',
  };
  return <span style={style}>{children}</span>;
}
