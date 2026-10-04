import { useEffect, useState } from "react";

export function resolveScrollMorphProgress(
  scrollY: number,
  startY = 0,
  endY = 88,
) {
  if (endY <= startY) return scrollY >= endY ? 1 : 0;
  return Math.max(0, Math.min(1, (scrollY - startY) / (endY - startY)));
}

export function useScrollMorphProgress({
  resetKey,
  enabled = true,
  startY = 0,
  endY = 88,
}: {
  resetKey: string;
  enabled?: boolean;
  startY?: number;
  endY?: number;
}) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      setProgress(0);
      return;
    }

    let frame: number | null = null;
    const sync = () => {
      frame = null;
      setProgress(resolveScrollMorphProgress(window.scrollY, startY, endY));
    };
    const onScroll = () => {
      if (frame != null) return;
      frame = window.requestAnimationFrame(sync);
    };

    sync();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame != null) window.cancelAnimationFrame(frame);
    };
  }, [enabled, endY, resetKey, startY]);

  return progress;
}
