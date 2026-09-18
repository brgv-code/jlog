import { useEffect, useRef, useState } from 'react';

/**
 * Width of an element, tracked.
 *
 * SVG charts need a real pixel width: a viewBox with preserveAspectRatio="none"
 * would scale the strokes along with the geometry, so a 2px line becomes 2.8px
 * on a wide screen and the whole set stops matching.
 */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  return { ref, width };
}
