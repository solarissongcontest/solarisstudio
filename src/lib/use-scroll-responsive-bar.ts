import { useCallback, useEffect, useRef, useState } from "react";

import {
  resolveScrollResponsiveBar,
  type ScrollResponsiveBarConfig,
} from "@/lib/interaction-physics";

export function useScrollResponsiveBar({
  enabled = true,
  resetKey,
  config,
}: {
  enabled?: boolean;
  resetKey: string;
  config?: Partial<ScrollResponsiveBarConfig>;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const collapsedRef = useRef(false);
  const lastY = useRef(0);
  const downTravel = useRef(0);
  const upTravel = useRef(0);
  const frame = useRef<number | null>(null);

  const setCollapsedState = useCallback((next: boolean) => {
    collapsedRef.current = next;
    setCollapsed(next);
  }, []);

  const expand = useCallback(() => {
    downTravel.current = 0;
    upTravel.current = 0;
    setCollapsedState(false);
  }, [setCollapsedState]);

  useEffect(() => {
    lastY.current = typeof window === "undefined" ? 0 : window.scrollY;
    downTravel.current = 0;
    upTravel.current = 0;
    setCollapsedState(false);
  }, [resetKey, setCollapsedState]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      expand();
      return;
    }

    lastY.current = window.scrollY;

    const evaluate = () => {
      frame.current = null;
      const currentY = Math.max(0, window.scrollY);
      const next = resolveScrollResponsiveBar(
        {
          collapsed: collapsedRef.current,
          currentY,
          lastY: lastY.current,
          downTravel: downTravel.current,
          upTravel: upTravel.current,
        },
        config
          ? {
              forceExpandedBefore: config.forceExpandedBefore ?? 80,
              collapseAfterY: config.collapseAfterY ?? 140,
              collapseTravel: config.collapseTravel ?? 56,
              expandTravel: config.expandTravel ?? 18,
            }
          : undefined,
      );

      lastY.current = currentY;
      downTravel.current = next.downTravel;
      upTravel.current = next.upTravel;
      if (next.collapsed !== collapsedRef.current) setCollapsedState(next.collapsed);
    };

    const onScroll = () => {
      if (frame.current != null) return;
      frame.current = window.requestAnimationFrame(evaluate);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame.current != null) window.cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [config, enabled, expand, setCollapsedState]);

  return { collapsed, expand };
}
