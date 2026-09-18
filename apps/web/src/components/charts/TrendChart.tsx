import { useState } from 'react';
import { useWidth } from './useSize';

export interface TrendPoint {
  label: string;
  value: number;
}

interface TrendChartProps {
  points: TrendPoint[];
  height?: number;
  /** Rendered in the tooltip after the value, e.g. "applications". */
  unit?: string;
}

const PAD_T = 8;
const PAD_B = 18;

/**
 * A single-series line over an area wash.
 *
 * No legend: one series, and the panel heading already names it. No y-axis
 * either — the peak is labelled directly, which is the one number worth reading
 * off a shape whose job is "is this going up or down".
 */
export function TrendChart({ points, height = 132, unit = '' }: TrendChartProps) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  if (points.length === 0) return null;

  const plotH = height - PAD_T - PAD_B;
  const max = Math.max(1, ...points.map((p) => p.value));
  const step = points.length > 1 ? width / (points.length - 1) : 0;

  const x = (i: number) => i * step;
  const y = (v: number) => PAD_T + plotH - (v / max) * plotH;

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.value)}`).join(' ');
  const area = `${line} L${x(points.length - 1)},${PAD_T + plotH} L0,${PAD_T + plotH} Z`;

  const peak = points.reduce((best, p, i) => (p.value > (points[best]?.value ?? 0) ? i : best), 0);
  const active = hover ?? null;

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`Applications added per week over the last ${points.length} weeks`}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const i = Math.round((e.clientX - rect.left) / (step || 1));
            setHover(Math.max(0, Math.min(points.length - 1, i)));
          }}
        >
          <title>Applications added per week</title>
          {/* Baseline only. A grid behind twenty-six columns of small numbers is
              ink that competes with the shape it is meant to support. */}
          <line
            x1={0}
            y1={PAD_T + plotH}
            x2={width}
            y2={PAD_T + plotH}
            stroke="var(--color-chart-grid)"
            strokeWidth={1}
          />
          <path d={area} fill="var(--color-chart-mark)" fillOpacity={0.1} />
          <path
            d={line}
            fill="none"
            stroke="var(--color-chart-mark)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {active !== null && (
            <>
              <line
                x1={x(active)}
                y1={PAD_T}
                x2={x(active)}
                y2={PAD_T + plotH}
                stroke="var(--color-chart-grid)"
                strokeWidth={1}
              />
              <circle
                cx={x(active)}
                cy={y(points[active]?.value ?? 0)}
                r={4}
                fill="var(--color-chart-mark)"
                stroke="var(--color-bg)"
                strokeWidth={2}
              />
            </>
          )}
          {active === null && (points[peak]?.value ?? 0) > 0 && (
            <circle
              cx={x(peak)}
              cy={y(points[peak]?.value ?? 0)}
              r={4}
              fill="var(--color-chart-mark)"
              stroke="var(--color-bg)"
              strokeWidth={2}
            />
          )}
          <text
            x={0}
            y={height - 4}
            fontSize={10}
            fill="var(--color-text-tertiary)"
            textAnchor="start"
          >
            {points[0]?.label}
          </text>
          <text
            x={width}
            y={height - 4}
            fontSize={10}
            fill="var(--color-text-tertiary)"
            textAnchor="end"
          >
            {points[points.length - 1]?.label}
          </text>
        </svg>
      )}

      {active !== null && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(Math.max(x(active), 0), Math.max(width - 120, 0)),
            top: 0,
            pointerEvents: 'none',
            backgroundColor: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-md)',
            padding: '6px 9px',
            fontSize: 'var(--text-xs)',
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ color: 'var(--color-text-tertiary)' }}>{points[active]?.label}</span>{' '}
          <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>
            {points[active]?.value}
            {unit && ` ${unit}`}
          </span>
        </div>
      )}
    </div>
  );
}
