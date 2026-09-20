import { useCallback, useRef, useState } from 'react';

/**
 * Width of an element, tracked.
 *
 * SVG charts need a real pixel width: a viewBox with preserveAspectRatio="none"
 * would scale the strokes along with the geometry, so a 2px line becomes 2.8px
 * on a wide screen and the whole set stops matching.
 *
 * The observer is attached from a callback ref rather than an effect. With an
 * effect and empty deps, a component whose first render bails out early — a
 * chart with no points yet, say — runs the effect while the node is still null,
 * never attaches, and then stays at width 0 forever once the data arrives. A
 * callback ref fires on every mount and unmount, so late-arriving nodes are
 * measured.
 */
export function useWidth<T extends HTMLElement>() {
  const [width, setWidth] = useState(0);
  const observer = useRef<ResizeObserver | null>(null);

  const ref = useCallback((node: T | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!node) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    ro.observe(node);
    observer.current = ro;
    setWidth(node.clientWidth);
  }, []);

  return { ref, width };
}
