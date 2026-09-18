export interface BarRow {
  label: string;
  value: number;
  /** A status colour, shown as a dot beside the label — never as the bar fill. */
  dot?: string;
  href?: string;
}

interface BarListProps {
  rows: BarRow[];
  /** Share a scale across lists that are meant to be compared. */
  max?: number;
}

/**
 * Horizontal bars, label left, value right.
 *
 * Every bar is the same hue on purpose. When these rows are pipeline stages the
 * status colour rides a dot next to the label instead of filling the bar: offer
 * green and rejected red are ΔE 4.2 apart under deuteranopia, which is legible
 * on a labelled pill and misleading when bar length is the comparison.
 */
export function BarList({ rows, max }: BarListProps) {
  const scale = Math.max(1, max ?? Math.max(...rows.map((r) => r.value), 1));
  return (
    <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
      {rows.map((row) => (
        <Row key={row.label} row={row} scale={scale} />
      ))}
    </div>
  );
}

const ROW_STYLE = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  textDecoration: 'none',
  color: 'inherit',
} as const;

function Row({ row, scale }: { row: BarRow; scale: number }) {
  const pct = (row.value / scale) * 100;
  const body = (
    <>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          minWidth: '92px',
          fontSize: 'var(--text-xs)',
          color: 'var(--color-text-secondary)',
        }}
      >
        {row.dot && (
          <span
            aria-hidden="true"
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              backgroundColor: row.dot,
              flexShrink: 0,
            }}
          />
        )}
        {row.label}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            height: '8px',
            width: `${Math.max(pct, row.value > 0 ? 2 : 0)}%`,
            backgroundColor: 'var(--color-chart-bar)',
            // Square where it meets the baseline, rounded at the data end.
            borderRadius: '0 4px 4px 0',
          }}
        />
      </span>
      <span
        style={{
          minWidth: '32px',
          textAlign: 'right',
          fontSize: 'var(--text-xs)',
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--color-text-primary)',
        }}
      >
        {row.value}
      </span>
    </>
  );

  return row.href ? (
    <a href={row.href} style={ROW_STYLE} title={`${row.value} ${row.label}`}>
      {body}
    </a>
  ) : (
    <div style={ROW_STYLE}>{body}</div>
  );
}
