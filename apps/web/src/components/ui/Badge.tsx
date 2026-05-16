import type { ReactNode } from 'react';

export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info';

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant | undefined;
}

const VARIANT_COLORS: Record<BadgeVariant, { text: string; bg: string }> = {
  success: { text: '#4ADE80', bg: 'rgba(74, 222, 128, 0.12)' },
  warning: { text: '#FACC15', bg: 'rgba(250, 204, 21, 0.12)' },
  danger: { text: '#F87171', bg: 'rgba(248, 113, 113, 0.12)' },
  info: { text: '#60A5FA', bg: 'rgba(96, 165, 250, 0.12)' },
  default: { text: 'var(--color-text-secondary)', bg: 'rgba(144, 144, 168, 0.12)' },
};

export function Badge({ children, variant = 'default' }: BadgeProps) {
  const colors = VARIANT_COLORS[variant];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontSize: '11px',
        fontWeight: 500,
        lineHeight: 1,
        padding: '2px 8px',
        borderRadius: 'var(--radius-full)',
        color: colors.text,
        backgroundColor: colors.bg,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}
