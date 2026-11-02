import { useEffect, useLayoutEffect, useRef, useState } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const media = window.matchMedia(REDUCED_MOTION_QUERY);
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return reduced;
}

type FlipOptions = {
  duration?: number;
  easing?: string;
};

/**
 * Tiny FLIP list animation used by scoreboards. The browser owns the actual
 * transform animation; Solaris only records the previous geometry and applies
 * the inverse delta after React commits the reordered list.
 */
export function useFlipList<T extends HTMLElement>(
  enabled: boolean,
  options: FlipOptions = {},
) {
  const ref = useRef<T | null>(null);
  const previousRects = useRef(new Map<string, DOMRect>());
  const duration = options.duration ?? 420;
  const easing = options.easing ?? "cubic-bezier(0.22, 1, 0.36, 1)";

  useLayoutEffect(() => {
    const container = ref.current;
    if (!container) return;

    const items = Array.from(
      container.querySelectorAll<HTMLElement>("[data-flip-key]"),
    );
    const nextRects = new Map<string, DOMRect>();

    for (const item of items) {
      const key = item.dataset.flipKey;
      if (!key) continue;
      const next = item.getBoundingClientRect();
      nextRects.set(key, next);

      const previous = previousRects.current.get(key);
      if (!enabled || !previous) continue;

      const deltaX = previous.left - next.left;
      const deltaY = previous.top - next.top;
      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) continue;

      item.getAnimations().forEach((animation) => animation.cancel());
      item.animate(
        [
          { transform: `translate(${deltaX}px, ${deltaY}px)` },
          { transform: "translate(0, 0)" },
        ],
        { duration, easing },
      );
    }

    previousRects.current = nextRects;
  });

  return ref;
}

type EnterVariant = "award" | "splash";

const ENTER_KEYFRAMES: Record<EnterVariant, Keyframe[]> = {
  award: [
    { opacity: 0, transform: "translateX(14px) scale(0.6)" },
    { opacity: 1, transform: "translateX(0) scale(1)" },
  ],
  splash: [
    { opacity: 0, transform: "scale(0.95)" },
    { opacity: 1, transform: "scale(1)" },
  ],
};

/** Run a small, one-shot native Web Animation whenever `trigger` changes. */
export function useEnterAnimation<T extends HTMLElement>(
  trigger: unknown,
  enabled: boolean,
  variant: EnterVariant,
) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled) return;

    element.getAnimations().forEach((animation) => animation.cancel());
    element.animate(ENTER_KEYFRAMES[variant], {
      duration: variant === "splash" ? 360 : 280,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
    });
  }, [trigger, enabled, variant]);

  return ref;
}
