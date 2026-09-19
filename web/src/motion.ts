import { useEffect, useRef, useState, type RefObject } from 'react';

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * Animate a number towards `target`. Starts from `from` on first run and from the
 * previously shown value afterwards, so a rescan eases between old and new figures.
 * rAF pauses in background tabs, so nothing runs while the page is hidden.
 */
export function useCountUp(target: number, opts: { from?: number; duration?: number; delay?: number; start?: boolean } = {}): number {
  const { from = 0, duration = 1100, delay = 0, start = true } = opts;
  const reduced = useRef(prefersReducedMotion());
  const shown = useRef<number | null>(null);
  const [value, setValue] = useState(() => (reduced.current ? target : from));

  useEffect(() => {
    if (!start) return;
    if (reduced.current) {
      shown.current = target;
      setValue(target);
      return;
    }
    const origin = shown.current ?? from;
    if (origin === target) {
      setValue(target);
      return;
    }
    let raf = 0;
    let t0 = 0;
    const tick = (now: number) => {
      if (!t0) t0 = now + delay;
      const p = Math.min(1, Math.max(0, (now - t0) / duration));
      const v = origin + (target - origin) * easeOutCubic(p);
      shown.current = v;
      setValue(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, start]);

  return value;
}

/** True once the element has scrolled into view (stays true). Falls back to true without IntersectionObserver. */
export function useInView<T extends Element>(opts: { rootMargin?: string; threshold?: number } = {}): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(() => typeof IntersectionObserver === 'undefined' || prefersReducedMotion());
  useEffect(() => {
    if (inView || !ref.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin: opts.rootMargin ?? '0px 0px -8% 0px', threshold: opts.threshold ?? 0.05 },
    );
    io.observe(ref.current);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView]);
  return [ref, inView];
}
