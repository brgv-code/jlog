export interface Column {
  label: string;
  value: number;
}

interface ColumnsProps {
  columns: Column[];
  height?: number;
}

/**
 * A small histogram. Fixed buckets, so the same chart a month from now is
 * comparable to this one.
 */
export function Columns({ columns, height = 96 }: ColumnsProps) {
  const max = Math.max(1, ...columns.map((c) => c.value));

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--space-2)', width: '100%' }}>
      {columns.map((col) => (
        <div
          key={col.label}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 'var(--space-2)',
          }}
          title={`${col.label}: ${col.value}`}
        >
          <span
            style={{
              fontSize: '10px',
              fontVariantNumeric: 'tabular-nums',
              color: col.value > 0 ? 'var(--color-text-secondary)' : 'var(--color-text-tertiary)',
            }}
          >
            {col.value}
          </span>
          <span
            style={{
              width: '100%',
              maxWidth: '24px',
              height: `${Math.max((col.value / max) * height, col.value > 0 ? 3 : 1)}px`,
              backgroundColor: col.value > 0 ? 'var(--color-chart-bar)' : 'var(--color-chart-grid)',
              borderRadius: '4px 4px 0 0',
            }}
          />
          <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>{col.label}</span>
        </div>
      ))}
    </div>
  );
}
