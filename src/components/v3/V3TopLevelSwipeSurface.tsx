import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { prefersReducedMotion } from "@/lib/interaction-physics";
import {
  classifyV3SwipeIntent,
  elementBlocksV3TopLevelSwipe,
  isV3BrowserEdgeGestureStart,
  resolveV3PageSwipeOffset,
  resolveV3PageSwipeTarget,
  resolveV3TopLevelSwipePolicy,
  type V3SwipeIntent,
} from "@/lib/v3-navigation-gesture";
import "@/styles/v3-top-level-swipe.css";

type SwipeState = {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastAt: number;
  velocityX: number;
  owner: V3SwipeIntent;
  viewportWidth: number;
};

/**
 * Shell-owned top-level swipe recognizer.
 *
 * Gesture arbitration is complete here, but the recognizer is intentionally
 * disabled until a caller supplies a live previous/current/next compositor.
 * Sliding a lone current page would expose empty space and violate the canonical
 * no-screenshot-fake requirement. Public/Organizer feature owners may provide
 * live adjacent surfaces later without changing the ownership classifier.
 */
export function V3TopLevelSwipeSurface({
  children,
  pathname,
  searchStr,
  activeIndex,
  itemCount,
  previewReady = false,
  onCommit,
}: {
  children: ReactNode;
  pathname: string;
  searchStr: string;
  activeIndex: number;
  itemCount: number;
  previewReady?: boolean;
  onCommit: (targetIndex: number) => void;
}) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<SwipeState | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const policy = resolveV3TopLevelSwipePolicy(pathname, searchStr);
  // Keep SSR/hydration deterministic. Reduced-motion preference is checked at
  // gesture start and CSS also disables the movement path.
  const enabled = policy === "enabled" && previewReady;

  const clearSettleTimer = useCallback(() => {
    if (settleTimerRef.current == null) return;
    window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = null;
  }, []);

  const resetSurface = useCallback(() => {
    clearSettleTimer();
    dragRef.current = null;
    const surface = surfaceRef.current;
    if (!surface) return;
    surface.style.setProperty("--v3-page-swipe-x", "0px");
    surface.removeAttribute("data-v3-page-swiping");
    surface.removeAttribute("data-v3-page-settling");
  }, [clearSettleTimer]);

  useEffect(() => resetSurface(), [pathname, resetSurface]);

  useEffect(() => {
    const interrupt = () => resetSurface();
    const hidden = () => {
      if (document.visibilityState !== "visible") resetSurface();
    };

    window.addEventListener("blur", interrupt);
    window.addEventListener("resize", interrupt);
    window.addEventListener("orientationchange", interrupt);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("blur", interrupt);
      window.removeEventListener("resize", interrupt);
      window.removeEventListener("orientationchange", interrupt);
      document.removeEventListener("visibilitychange", hidden);
      resetSurface();
    };
  }, [resetSurface]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      !enabled ||
      prefersReducedMotion() ||
      event.pointerType === "mouse" ||
      event.button !== 0 ||
      elementBlocksV3TopLevelSwipe(event.target) ||
      isV3BrowserEdgeGestureStart({
        clientX: event.clientX,
        viewportWidth: window.innerWidth,
      })
    ) {
      return;
    }

    clearSettleTimer();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastAt: event.timeStamp,
      velocityX: 0,
      owner: "undecided",
      viewportWidth: Math.max(1, window.visualViewport?.width ?? window.innerWidth),
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (drag.owner === "undecided") {
      drag.owner = classifyV3SwipeIntent({ deltaX, deltaY });
      if (drag.owner === "vertical") {
        dragRef.current = null;
        return;
      }
      if (drag.owner !== "horizontal") return;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      surfaceRef.current?.setAttribute("data-v3-page-swiping", "true");
    }

    if (drag.owner !== "horizontal") return;
    const elapsed = Math.max(1, event.timeStamp - drag.lastAt);
    const instantVelocity = (event.clientX - drag.lastX) / elapsed;
    drag.velocityX = drag.velocityX * 0.7 + instantVelocity * 0.3;
    drag.lastX = event.clientX;
    drag.lastAt = event.timeStamp;

    const offset = resolveV3PageSwipeOffset({
      rawDelta: deltaX,
      activeIndex,
      itemCount,
      viewportWidth: drag.viewportWidth,
    });
    surfaceRef.current?.style.setProperty("--v3-page-swipe-x", `${offset.toFixed(2)}px`);
    event.preventDefault();
  };

  const finish = (event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;

    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture may already have been released by Safari.
    }

    const surface = surfaceRef.current;
    if (!surface || cancelled || drag.owner !== "horizontal") {
      resetSurface();
      return;
    }

    const deltaX = event.clientX - drag.startX;
    const targetIndex = resolveV3PageSwipeTarget({
      deltaX,
      velocityX: drag.velocityX,
      viewportWidth: drag.viewportWidth,
      activeIndex,
      itemCount,
    });

    surface.removeAttribute("data-v3-page-swiping");
    surface.setAttribute("data-v3-page-settling", "true");

    if (targetIndex === activeIndex) {
      surface.style.setProperty("--v3-page-swipe-x", "0px");
      settleTimerRef.current = window.setTimeout(resetSurface, 190);
      return;
    }

    const direction = targetIndex > activeIndex ? -1 : 1;
    surface.style.setProperty(
      "--v3-page-swipe-x",
      `${(direction * drag.viewportWidth).toFixed(2)}px`,
    );
    settleTimerRef.current = window.setTimeout(() => {
      settleTimerRef.current = null;
      onCommit(targetIndex);
    }, 170);
  };

  return (
    <div
      ref={surfaceRef}
      className="v3-top-level-swipe-surface"
      data-v3-top-level-swipe-policy={policy}
      data-v3-top-level-swipe-preview-ready={previewReady ? "true" : "false"}
      data-v3-top-level-swipe-enabled={enabled ? "true" : "false"}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => finish(event)}
      onPointerCancel={(event) => finish(event, true)}
      onLostPointerCapture={(event) => {
        if (dragRef.current?.pointerId === event.pointerId) finish(event, true);
      }}
    >
      {children}
    </div>
  );
}
