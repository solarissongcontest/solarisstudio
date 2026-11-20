import { useEffect, useRef } from "react";

/**
 * Reveal a browser section without page-level scrolling, which can move
 * the entire document and interfere with the phone browser's address bar.
 */
export function organizerWebSectionRevealDelta(
  container: Pick<DOMRectReadOnly, "left" | "right">,
  active: Pick<DOMRectReadOnly, "left" | "right">,
): number {
  if (active.left < container.left) return active.left - container.left;
  if (active.right > container.right) return active.right - container.right;
  return 0;
}

export function useOrganizerWebSectionVisibility(routeKey: string) {
  const navRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    const revealActiveSection = () => {
      const active = nav.querySelector<HTMLElement>("[aria-current]");
      if (!active || nav.getClientRects().length === 0) return;
      const delta = organizerWebSectionRevealDelta(
        nav.getBoundingClientRect(),
        active.getBoundingClientRect(),
      );
      if (Math.abs(delta) > 1) nav.scrollLeft += delta;
    };

    revealActiveSection();
    window.addEventListener("resize", revealActiveSection);
    return () => window.removeEventListener("resize", revealActiveSection);
  }, [routeKey]);

  return navRef;
}
