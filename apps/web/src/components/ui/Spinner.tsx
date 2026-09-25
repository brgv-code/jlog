interface SpinnerProps {
  size?: number;
}

/**
 * The quick-wait loader, and still the default one.
 *
 * Deliberately not the jlog mark: a logo that appears on every
 * few-hundred-millisecond request stops reading as care and starts reading as
 * slowness. `JlogMark mode="think"` is for waits measured in seconds.
 */
export function Spinner({ size = 20 }: SpinnerProps) {
  return (
    <>
      <style>{`
        @keyframes jlog-spin {
          to { transform: rotate(360deg); }
        }
        .jlog-spinner {
          animation: jlog-spin 0.7s var(--ease-loop, linear) infinite;
          border-radius: 50%;
          border: 2px solid var(--color-border);
          border-top-color: var(--color-accent);
          display: inline-block;
          flex-shrink: 0;
        }
      `}</style>
      <span
        className="jlog-spinner"
        style={{ width: size, height: size }}
        role="status"
        aria-label="Loading"
      />
    </>
  );
}
