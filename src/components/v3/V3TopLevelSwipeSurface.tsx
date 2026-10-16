import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { APP_RESUME_EVENT } from "@/lib/app-lifecycle";
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
  lensStepWidth: number;
  tabItems: HTMLElement[];
};

type SettlingComposition = {
  originIndex: number;
  targetIndex: number;
  previousSurface: ReactNode;
  currentSurface: ReactNode;
  nextSurface: ReactNode;
};

type CommittedRouteSnapshot = {
  originRouteKey: string;
  targetRouteKey: string | null;
};

type SwipeSlot = "previous" | "current" | "next";

function navigationMaterial() {
  return document.querySelector<HTMLElement>(
    "[data-v3-liquid-tabbar] .v3-liquid-tabbar__material",
  );
}

function shellInteractionBlocked() {
  const root = document.documentElement;
  return (
    root.hasAttribute("data-solaris-feature-overlay-open") ||
    root.hasAttribute("data-solaris-keyboard-open")
  );
}

function routeSnapshotKey(pathname: string, searchStr: string) {
  return `${pathname}\u0000${searchStr}`;
}

function canonicalSwipeSlot(
  settlingComposition: SettlingComposition | null,
  activeIndex: number,
): SwipeSlot {
  if (
    settlingComposition == null ||
    activeIndex !== settlingComposition.targetIndex
  ) {
    return "current";
  }
  if (settlingComposition.targetIndex < settlingComposition.originIndex) return "previous";
  if (settlingComposition.targetIndex > settlingComposition.originIndex) return "next";
  return "current";
}

/**
 * Shell-owned top-level swipe recognizer and three-surface viewport.
 *
 * The caller supplies live previous/current/next React surfaces. The gesture
 * publishes one continuous navigation progress, and both page translation and
 * the Liquid Glass lens derive from that value. Route content remains owned by
 * Public/Organizer feature code; this shell never fabricates preview data.
 */
export function V3TopLevelSwipeSurface({
  children,
  previousSurface = null,
  nextSurface = null,
  pathname,
  searchStr,
  activeIndex,
  itemCount,
  previewReady = false,
  interactionKey = null,
  onCommit,
  onSettled,
}: {
  children: ReactNode;
  previousSurface?: ReactNode;
  nextSurface?: ReactNode;
  pathname: string;
  searchStr: string;
  activeIndex: number;
  itemCount: number;
  previewReady?: boolean;
  interactionKey?: string | null;
  onCommit: (targetIndex: number) => void;
  onSettled?: (targetIndex: number) => void;
}) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<SwipeState | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const activeIndexRef = useRef(activeIndex);
  const committedTargetRef = useRef<number | null>(null);
  const committedInteractionKeyRef = useRef<string | null>(null);
  const committedRouteSnapshotRef = useRef<CommittedRouteSnapshot | null>(null);
  const settlingCompositionRef = useRef<SettlingComposition | null>(null);
  const [settlingComposition, setSettlingComposition] =
    useState<SettlingComposition | null>(null);
  activeIndexRef.current = activeIndex;

  const policy = resolveV3TopLevelSwipePolicy(pathname, searchStr);
  const requiredAdjacentSurfacesReady =
    (activeIndex === 0 || previousSurface != null) &&
    (activeIndex === itemCount - 1 || nextSurface != null);
  // Keep SSR/hydration deterministic. Reduced-motion preference is checked at
  // gesture start and CSS also disables the movement path.
  const enabled = policy === "enabled" && previewReady && requiredAdjacentSurfacesReady;

  const clearSettleTimer = useCallback(() => {
    if (settleTimerRef.current == null) return;
    window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = null;
  }, []);

  const clearNavigationMaterial = useCallback(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.style.setProperty("--v3-navigation-progress", String(activeIndexRef.current));
    root.removeAttribute("data-v3-navigation-progress-owner");

    const material = navigationMaterial();
    material?.style.setProperty("--v3-liquid-drag-x", "0px");
    material?.removeAttribute("data-v3-page-swiping");
    material?.removeAttribute("data-v3-page-settling");
    material
      ?.querySelectorAll<HTMLElement>("[data-v3-tab-index]")
      .forEach((item) => {
        item.style.removeProperty("--v3-tab-visual-weight");
        item.style.removeProperty("--v3-tab-visual-opacity");
        item.style.removeProperty("--v3-tab-visual-scale");
      });
  }, []);

  const resetSurface = useCallback(() => {
    clearSettleTimer();
    const drag = dragRef.current;
    dragRef.current = null;
    committedTargetRef.current = null;
    committedInteractionKeyRef.current = null;
    committedRouteSnapshotRef.current = null;
    if (settlingCompositionRef.current != null) {
      settlingCompositionRef.current = null;
      setSettlingComposition(null);
    }

    const surface = surfaceRef.current;
    if (surface) {
      if (drag) {
        try {
          surface.releasePointerCapture?.(drag.pointerId);
        } catch {
          // Capture may already have been released by the browser interruption.
        }
      }
      surface.removeAttribute("data-v3-page-swiping");
      surface.removeAttribute("data-v3-page-settling");
    }
    const track = trackRef.current;
    if (track) {
      track.style.setProperty("--v3-page-swipe-x", "0px");
      track.removeAttribute("data-v3-page-swiping");
      track.removeAttribute("data-v3-page-settling");
    }
    clearNavigationMaterial();
  }, [clearNavigationMaterial, clearSettleTimer]);

  const publishVisualProgress = useCallback(
    (progress: number, state: SwipeState, phase: "drag" | "settle") => {
      const boundedProgress = Math.max(-0.18, Math.min(itemCount - 1 + 0.18, progress));
      const root = document.documentElement;
      root.style.setProperty("--v3-navigation-progress", boundedProgress.toFixed(4));
      root.setAttribute("data-v3-navigation-progress-owner", "page-swipe");

      const track = trackRef.current;
      if (track) {
        const offsetRatio = activeIndex - boundedProgress;
        track.style.setProperty("--v3-page-swipe-x", `${(offsetRatio * 100).toFixed(4)}%`);
        track.toggleAttribute("data-v3-page-swiping", phase === "drag");
        track.toggleAttribute("data-v3-page-settling", phase === "settle");
      }

      const material = navigationMaterial();
      if (material) {
        const lensOffset = (boundedProgress - activeIndex) * state.lensStepWidth;
        material.style.setProperty("--v3-liquid-drag-x", `${lensOffset.toFixed(2)}px`);
        material.toggleAttribute("data-v3-page-swiping", phase === "drag");
        material.toggleAttribute("data-v3-page-settling", phase === "settle");
      }

      for (let index = 0; index < state.tabItems.length; index += 1) {
        const item = state.tabItems[index];
        if (!item) continue;
        const weight = Math.max(0, 1 - Math.abs(index - boundedProgress));
        item.style.setProperty("--v3-tab-visual-weight", weight.toFixed(4));
        item.style.setProperty(
          "--v3-tab-visual-opacity",
          (0.78 + weight * 0.22).toFixed(4),
        );
        item.style.setProperty(
          "--v3-tab-visual-scale",
          (0.97 + weight * 0.05).toFixed(4),
        );
      }
    },
    [activeIndex, itemCount],
  );

  useEffect(() => {
    const expectedTarget = committedTargetRef.current;
    const routeSnapshot = committedRouteSnapshotRef.current;
    const ownedTargetActive =
      expectedTarget != null &&
      activeIndex === expectedTarget &&
      committedInteractionKeyRef.current === interactionKey &&
      routeSnapshot != null;

    if (!ownedTargetActive) {
      resetSurface();
      return;
    }

    const currentRouteKey = routeSnapshotKey(pathname, searchStr);
    if (routeSnapshot.targetRouteKey == null) {
      if (currentRouteKey !== routeSnapshot.originRouteKey) {
        routeSnapshot.targetRouteKey = currentRouteKey;
      }
      return;
    }

    if (currentRouteKey !== routeSnapshot.targetRouteKey) resetSurface();
  }, [activeIndex, interactionKey, pathname, resetSurface, searchStr]);

  useEffect(() => {
    const interrupt = () => resetSurface();
    const hidden = () => {
      if (document.visibilityState !== "visible") resetSurface();
    };
    const root = document.documentElement;
    const rootInterruptionObserver = new MutationObserver(() => {
      if (shellInteractionBlocked()) resetSurface();
    });

    rootInterruptionObserver.observe(root, {
      attributes: true,
      attributeFilter: [
        "data-solaris-feature-overlay-open",
        "data-solaris-keyboard-open",
      ],
    });
    window.addEventListener("blur", interrupt);
    window.addEventListener("resize", interrupt);
    window.addEventListener("orientationchange", interrupt);
    window.addEventListener("pagehide", interrupt);
    window.addEventListener(APP_RESUME_EVENT, interrupt);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      rootInterruptionObserver.disconnect();
      window.removeEventListener("blur", interrupt);
      window.removeEventListener("resize", interrupt);
      window.removeEventListener("orientationchange", interrupt);
      window.removeEventListener("pagehide", interrupt);
      window.removeEventListener(APP_RESUME_EVENT, interrupt);
      document.removeEventListener("visibilitychange", hidden);
      resetSurface();
    };
  }, [resetSurface]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      !enabled ||
      committedTargetRef.current != null ||
      prefersReducedMotion() ||
      shellInteractionBlocked() ||
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
    const material = navigationMaterial();
    const tabItems = material
      ? Array.from(material.querySelectorAll<HTMLElement>("[data-v3-tab-index]"))
      : [];
    const activeTab = tabItems[activeIndex];
    const adjacentTab = tabItems[activeIndex + 1] ?? tabItems[activeIndex - 1];
    const activeRect = activeTab?.getBoundingClientRect();
    const adjacentRect = adjacentTab?.getBoundingClientRect();
    const activeCenter = activeRect ? activeRect.left + activeRect.width / 2 : 0;
    const adjacentCenter = adjacentRect ? adjacentRect.left + adjacentRect.width / 2 : 0;
    const lensStepWidth =
      activeRect && adjacentRect
        ? Math.abs(adjacentCenter - activeCenter)
        : (activeRect?.width ?? 0);

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastAt: event.timeStamp,
      velocityX: 0,
      owner: "undecided",
      viewportWidth: Math.max(1, window.visualViewport?.width ?? window.innerWidth),
      lensStepWidth,
      tabItems,
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
    const progress = activeIndex - offset / drag.viewportWidth;
    publishVisualProgress(progress, drag, "drag");
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
      publishVisualProgress(activeIndex, drag, "settle");
      settleTimerRef.current = window.setTimeout(resetSurface, 190);
      return;
    }

    const frozenComposition: SettlingComposition = {
      originIndex: activeIndex,
      targetIndex,
      previousSurface,
      currentSurface: children,
      nextSurface,
    };
    settlingCompositionRef.current = frozenComposition;
    setSettlingComposition(frozenComposition);
    committedTargetRef.current = targetIndex;
    committedInteractionKeyRef.current = interactionKey;
    committedRouteSnapshotRef.current = {
      originRouteKey: routeSnapshotKey(pathname, searchStr),
      targetRouteKey: null,
    };

    publishVisualProgress(targetIndex, drag, "settle");
    onCommit(targetIndex);
    settleTimerRef.current = window.setTimeout(() => {
      settleTimerRef.current = null;
      resetSurface();
      onSettled?.(targetIndex);
    }, 180);
  };

  const visualPreviousSurface = settlingComposition?.previousSurface ?? previousSurface;
  const visualCurrentSurface = settlingComposition?.currentSurface ?? children;
  const visualNextSurface = settlingComposition?.nextSurface ?? nextSurface;
  const canonicalSlot = canonicalSwipeSlot(settlingComposition, activeIndex);

  return (
    <div
      ref={surfaceRef}
      className="v3-top-level-swipe-surface"
      data-v3-top-level-swipe-policy={policy}
      data-v3-top-level-swipe-preview-ready={previewReady ? "true" : "false"}
      data-v3-top-level-swipe-adjacent-ready={requiredAdjacentSurfacesReady ? "true" : "false"}
      data-v3-top-level-swipe-enabled={enabled ? "true" : "false"}
      data-v3-top-level-swipe-committed-target={settlingComposition?.targetIndex ?? undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => finish(event)}
      onPointerCancel={(event) => finish(event, true)}
      onLostPointerCapture={(event) => {
        if (dragRef.current?.pointerId === event.pointerId) finish(event, true);
      }}
    >
      <div ref={trackRef} className="v3-top-level-swipe-track">
        {visualPreviousSurface != null ? (
          <div
            className="v3-top-level-swipe-page v3-top-level-swipe-page--previous"
            aria-hidden={canonicalSlot === "previous" ? undefined : true}
            inert={canonicalSlot !== "previous"}
            data-v3-swipe-preview="previous"
            data-v3-swipe-canonical={canonicalSlot === "previous" ? "true" : undefined}
          >
            {visualPreviousSurface}
          </div>
        ) : null}
        <div
          className="v3-top-level-swipe-page v3-top-level-swipe-page--current"
          aria-hidden={canonicalSlot === "current" ? undefined : true}
          inert={canonicalSlot !== "current"}
          data-v3-swipe-canonical={canonicalSlot === "current" ? "true" : undefined}
        >
          {visualCurrentSurface}
        </div>
        {visualNextSurface != null ? (
          <div
            className="v3-top-level-swipe-page v3-top-level-swipe-page--next"
            aria-hidden={canonicalSlot === "next" ? undefined : true}
            inert={canonicalSlot !== "next"}
            data-v3-swipe-preview="next"
            data-v3-swipe-canonical={canonicalSlot === "next" ? "true" : undefined}
          >
            {visualNextSurface}
          </div>
        ) : null}
      </div>
    </div>
  );
}
