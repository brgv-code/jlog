/**
 * The jlog mark, animated.
 *
 * The geometry is the one in `public/favicon.svg` and the extension's
 * `icons-src/icon.svg` — same rounded tile, same detached blue dot above the
 * hook of the j. That dot being a separate element is the whole point: it is
 * what can lift off like a hat, and what can orbit while the app is thinking.
 *
 * Two jobs, deliberately kept apart:
 *
 *   `think` — a loop, for waits measured in seconds. Long model work, and the
 *     first paint of a page while the session is being checked. NOT for quick
 *     fetches: a logo that appears on every few-hundred-millisecond request
 *     stops reading as care and starts reading as slowness, which is why
 *     {@link Spinner} still exists and is still the default.
 *
 *   `tip` — plays once, for a moment worth marking. The mark bows and the dot
 *     lifts off, then a check draws itself into the corner.
 *
 * The keyframes live in `styles/motion.css` with the rest of the motion system,
 * not in an inline <style> here. Inline was the first shape of this and it
 * emitted the same rules once per mark on the page — three times over on
 * /designsystem, which is where it became obvious.
 */

export type MarkMode = 'idle' | 'think' | 'tip';

interface JlogMarkProps {
  mode?: MarkMode;
  size?: number;
  /**
   * Announced to screen readers when the mark is standing in for a status.
   * A decorative mark should pass nothing and stays `aria-hidden`.
   */
  label?: string;
}

export function JlogMark({ mode = 'idle', size = 40, label }: JlogMarkProps) {
  const showCheck = mode === 'tip';

  return (
    <svg
      className={`jlog-mark jlog-mark--${mode}`}
      width={size}
      height={size}
      viewBox="0 0 42 42"
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {/*
          Literal colours, not tokens: this is the logo, and a logo that
          restyles itself per theme is a different logo. The tile is dark in
          both, exactly as it is in the tab strip and the Chrome toolbar.
        */}
      <rect className="jlog-mark__tile" width="32" height="32" rx="7" fill="#18181b" />
      <circle className="jlog-mark__dot" cx="20" cy="6.5" r="2.2" fill="#2563eb" />
      <path
        d="M20 12.5 V19.5 A4.25 4.25 0 0 1 11.5 19.5"
        fill="none"
        stroke="#ffffff"
        strokeWidth="4"
        strokeLinecap="round"
      />
      {showCheck && (
        <>
          {/* A ring of page background, so the badge reads as sitting on top
                of the tile rather than punched into it. */}
          <circle cx="31" cy="31" r="9.5" style={{ fill: 'var(--color-bg)' }} />
          <circle cx="31" cy="31" r="7.5" style={{ fill: 'var(--color-success)' }} />
          <path
            className="jlog-mark__check"
            d="M27.4 31.1 l2.5 2.5 l4.4 -4.8"
            fill="none"
            stroke="#ffffff"
            strokeWidth="2.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
    </svg>
  );
}
