import { useLayoutEffect, useRef, type ComponentPropsWithoutRef } from "react";

import "./scoreboard-motion.css";

type RectSnapshot = {
  left: number;
  top: number;
  scrollX: number;
  scrollY: number;
};

/**
 * Animate score row reordering with browser-native FLIP rather than shipping a
 * full motion runtime. Layout changes caused only by scrolling are ignored.
 */
export function AnimatedListItem({
  animate = true,
  ...props
}: ComponentPropsWithoutRef<"li"> & { animate?: boolean }) {
  const elementRef = useRef<HTMLLIElement>(null);
  const previousRef = useRef<RectSnapshot | null>(null);

  useLayoutEffect(() => {
    const node = elementRef.current;
    if (!node || typeof window === "undefined") return;
    const rect = node.getBoundingClientRect();
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const previous = previousRef.current;
    previousRef.current = { left: rect.left, top: rect.top, scrollX, scrollY };

    if (
      !animate ||
      !previous ||
      previous.scrollX !== scrollX ||
      previous.scrollY !== scrollY ||
      (typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches) ||
      typeof node.animate !== "function"
    ) {
      return;
    }

    const x = previous.left - rect.left;
    const y = previous.top - rect.top;
    if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) return;

    // Individual translate composes with the configured broadcast card theme.
    node.animate(
      [{ translate: x + "px " + y + "px" }, { translate: "0px 0px" }],
      { duration: 410, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
  });

  return <li ref={elementRef} {...props} />;
}
