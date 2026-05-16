interface SpinnerProps {
  size?: number;
}

export function Spinner({ size = 20 }: SpinnerProps) {
  return (
    <>
      <style>{`
        @keyframes jlog-spin {
          to { transform: rotate(360deg); }
        }
        .jlog-spinner {
          animation: jlog-spin 0.7s linear infinite;
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
