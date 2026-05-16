import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-12) var(--space-8)',
        gap: 'var(--space-3)',
        textAlign: 'center',
      }}
    >
      <p
        style={{
          fontSize: 'var(--text-base)',
          fontWeight: 500,
          color: 'var(--color-text-primary)',
        }}
      >
        {title}
      </p>
      <p
        style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--color-text-secondary)',
          maxWidth: '360px',
        }}
      >
        {description}
      </p>
      {action && <div style={{ marginTop: 'var(--space-2)' }}>{action}</div>}
    </div>
  );
}
