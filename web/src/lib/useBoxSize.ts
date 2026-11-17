import { useEffect, useState, type RefObject } from 'react';

/** 요소 크기 (바뀌면 다시 잰다). 잴 수 없으면(테스트 등) fallback */
export function useBoxSize(
  ref: RefObject<HTMLElement | null>,
  fallback: { width: number; height: number },
) {
  const [size, setSize] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0)
        setSize({ width: Math.round(width), height: Math.round(height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}
