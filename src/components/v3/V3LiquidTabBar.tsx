import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { KubeLiquidGlassBackdrop } from "@/components/app/KubeLiquidGlassBackdrop";
import { APP_RESUME_EVENT } from "@/lib/app-lifecycle";
import {
  clearAppUpdateBlocker,
  setAppUpdateBlocker,
} from "@/lib/app-update-safety";
import {
  prefersReducedMotion,
  resolveElasticDrag,
  resolveTabDragTargetIndex,
} from "@/lib/interaction-physics";
import {
  resolveV3LogicalHorizontalDelta,
  type V3LayoutDirection,
} from "@/lib/v3-navigation-gesture";
import {
  resolveV3NavigationVisualProgress,
  resolveV3TabIconVisualState,
} from "@/lib/v3-navigation-visual-progress";
import { useScrollResponsiveBar } from "@/lib/use-scroll-responsive-bar";
import { useSolarisPressHold } from "@/lib/use-solaris-press-hold";
import { cn } from "@/lib/utils";
import "@/styles/v3-liquid-tabbar.css";
import "@/styles/v3-navigation-fixed-geometry.css";

const V3_LIQUID_LENS_UPDATE_BLOCKER = "v3-liquid-lens-drag";

export type V3LiquidTabDestination = {
  id: string;
  label: string;
  to: string;
  icon: LucideIcon;
  active: boolean;
  emphasis?: boolean;
  badge?: number;
};

type DragState = {
  pointerId: number;
  captureTarget: HTMLAnchorElement;
  startX: number;
  originIndex: number;
  previewIndex: number;
  moved: boolean;
  lastX: number;
  lastAt: number;
  velocityX: number;
  minDelta: number;
  maxDelta: number;
  slotWidth: number;
  layoutDirection: V3LayoutDirection;
  tabIcons: SVGElement[];
};

function triggerSelectionHaptic(duration = 8) {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  navigator.vibrate(duration);
}

function navigationItemLabel(label: string, badge: number) {
  if (badge <= 0) return label;
  return `${label}, ${badge} item${badge === 1 ? "" : "s"}`;
}

function layoutDirectionFor(element: Element): V3LayoutDirection {
  return getComputedStyle(element).direction === "rtl" ? "rtl" : "ltr";
}

/**
 * Canonical V3 mobile navigation material.
 *
 * Semantic links remain the non-gesture navigation path. Press, hold, scroll
 * compaction and direct lens dragging are progressive enhancement only. The
 * parent shell owns route memory and canonical navigation so this component
 * never invents URL state of its own.
 */
export function V3LiquidTabBar({
  pathname,
  destinations,
  onSelect,
}: {
  pathname: string;
  destinations: readonly V3LiquidTabDestination[];
  onSelect: (destination: V3LiquidTabDestination) => void;
}) {
  const activeIndex = Math.max(
    0,
    destinations.findIndex((destination) => destination.active),
  );
  const [dragPreviewIndex, setDragPreviewIndex] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [layoutDirection, setLayoutDirection] = useState<V3LayoutDirection>("ltr");
  const barRef = useRef<HTMLElement | null>(null);
  const materialRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<DragState | null>(null);
  const suppressClick = useRef(false);
  const lastPreviewHaptic = useRef(activeIndex);
  const heldHapticFired = useRef(false);
  const { collapsed, expand } = useScrollResponsiveBar({
    enabled: true,
    resetKey: pathname,
  });
  const {
    held,
    begin: beginHold,
    move: moveHold,
    end: endHold,
  } = useSolarisPressHold();

  const previewIndex = dragPreviewIndex ?? activeIndex;
  const visualLensIndex = dragging ? activeIndex : previewIndex;
  const count = Math.max(1, destinations.length);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const bar = barRef.current;
    const material = materialRef.current;

    const syncDirection = () => {
      if (!material) return;
      const nextDirection = layoutDirectionFor(material);
      setLayoutDirection((current) =>
        current === nextDirection ? current : nextDirection,
      );
    };

    const sync = () => {
      syncDirection();
      if (
        !bar ||
        window.innerWidth >= 1024 ||
        root.hasAttribute("data-solaris-keyboard-open")
      ) {
        root.style.setProperty("--v3-bottom-obstruction", "0px");
        root.style.setProperty("--solaris-bottom-obstruction", "0px");
        return;
      }
      const rect = bar.getBoundingClientRect();
      const obstruction = Math.min(136, Math.max(0, window.innerHeight - rect.top) + 10);
      root.style.setProperty("--v3-bottom-obstruction", `${Math.ceil(obstruction)}px`);
      root.style.setProperty("--solaris-bottom-obstruction", `${Math.ceil(obstruction)}px`);
    };

    sync();
    const observer =
      typeof ResizeObserver !== "undefined" && bar ? new ResizeObserver(sync) : null;
    if (observer && bar) observer.observe(bar);
    const rootObserver =
      typeof MutationObserver !== "undefined" ? new MutationObserver(sync) : null;
    rootObserver?.observe(root, {
      attributes: true,
      attributeFilter: ["data-solaris-keyboard-open", "dir"],
    });
    window.addEventListener("resize", sync);
    window.visualViewport?.addEventListener("resize", sync);

    return () => {
      observer?.disconnect();
      rootObserver?.disconnect();
      window.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("resize", sync);
    };
  }, [collapsed, pathname]);

  useEffect(
    () => () => {
      window.requestAnimationFrame(() => {
        const root = document.documentElement;
        const nextV3Owner = document.querySelector("[data-v3-liquid-tabbar]");
        if (!nextV3Owner) root.style.removeProperty("--v3-bottom-obstruction");
        if (
          document.querySelector(
            "[data-v3-liquid-tabbar], [data-v3-organizer-tabbar], .solaris-app-tabbar",
          )
        ) {
          return;
        }
        root.style.setProperty("--solaris-bottom-obstruction", "0px");
      });
    },
    [],
  );

  useEffect(() => {
    if (!held) {
      heldHapticFired.current = false;
      return;
    }
    if (heldHapticFired.current) return;
    heldHapticFired.current = true;
    triggerSelectionHaptic(10);
  }, [held]);

  useEffect(() => {
    if (!dragging || previewIndex === lastPreviewHaptic.current) return;
    lastPreviewHaptic.current = previewIndex;
    triggerSelectionHaptic(6);
  }, [dragging, previewIndex]);

  useEffect(() => {
    if (dragging || dragPreviewIndex == null || dragPreviewIndex !== activeIndex) return;
    setDragPreviewIndex(null);
  }, [activeIndex, dragPreviewIndex, dragging]);

  const tabRects = () => {
    const material = materialRef.current;
    if (!material) return [];
    return Array.from(material.querySelectorAll<HTMLElement>("[data-v3-tab-index]")).map(
      (element) => element.getBoundingClientRect(),
    );
  };

  const resetDragDom = useCallback(() => {
    clearAppUpdateBlocker(V3_LIQUID_LENS_UPDATE_BLOCKER);
    const drag = dragState.current;
    if (drag) {
      try {
        if (drag.captureTarget.hasPointerCapture?.(drag.pointerId)) {
          drag.captureTarget.releasePointerCapture?.(drag.pointerId);
        }
      } catch {
        // Browser may already have released pointer capture.
      }
      for (const icon of drag.tabIcons) {
        icon.style.removeProperty("opacity");
        icon.style.removeProperty("transform");
        icon.style.removeProperty("stroke-width");
      }
    }

    const material = materialRef.current;
    material?.style.setProperty("--v3-liquid-drag-x", "0px");
    material?.style.setProperty("--v3-liquid-scale-x", "1");
    material?.style.setProperty("--v3-liquid-pull-width", "0px");
    material?.style.setProperty("--v3-liquid-pull-height", "0px");
    material?.style.setProperty("--v3-liquid-pull-radius", "0px");
    material?.removeAttribute("data-drag-direction");
    dragState.current = null;
  }, []);

  const clearDrag = useCallback(() => {
    endHold();
    resetDragDom();
    setDragging(false);
    setDragPreviewIndex(null);
  }, [endHold, resetDragDom]);

  const settleDrag = useCallback(
    (targetIndex: number) => {
      endHold();
      resetDragDom();
      setDragging(false);
      setDragPreviewIndex(targetIndex);
    },
    [endHold, resetDragDom],
  );

  useEffect(() => {
    const resetInterruptedGesture = () => clearDrag();
    const resetWhenHidden = () => {
      if (document.visibilityState !== "visible") clearDrag();
    };
    const root = document.documentElement;
    const rootInterruptionObserver =
      typeof MutationObserver !== "undefined"
        ? new MutationObserver(() => {
            if (
              root.hasAttribute("data-solaris-feature-overlay-open") ||
              root.hasAttribute("data-solaris-keyboard-open")
            ) {
              clearDrag();
            }
          })
        : null;

    rootInterruptionObserver?.observe(root, {
      attributes: true,
      attributeFilter: [
        "data-solaris-feature-overlay-open",
        "data-solaris-keyboard-open",
      ],
    });
    window.addEventListener("blur", resetInterruptedGesture);
    window.addEventListener("resize", resetInterruptedGesture);
    window.addEventListener("orientationchange", resetInterruptedGesture);
    window.addEventListener("pagehide", resetInterruptedGesture);
    window.addEventListener(APP_RESUME_EVENT, resetInterruptedGesture);
    document.addEventListener("visibilitychange", resetWhenHidden);

    return () => {
      rootInterruptionObserver?.disconnect();
      window.removeEventListener("blur", resetInterruptedGesture);
      window.removeEventListener("resize", resetInterruptedGesture);
      window.removeEventListener("orientationchange", resetInterruptedGesture);
      window.removeEventListener("pagehide", resetInterruptedGesture);
      window.removeEventListener(APP_RESUME_EVENT, resetInterruptedGesture);
      document.removeEventListener("visibilitychange", resetWhenHidden);
      resetDragDom();
    };
  }, [clearDrag, pathname, resetDragDom]);

  const startDrag = (
    event: ReactPointerEvent<HTMLAnchorElement>,
    index: number,
    active: boolean,
  ) => {
    if (
      !active ||
      collapsed ||
      prefersReducedMotion() ||
      document.documentElement.hasAttribute("data-solaris-keyboard-open") ||
      document.documentElement.hasAttribute("data-solaris-feature-overlay-open") ||
      (event.pointerType === "mouse" && event.button !== 0)
    ) {
      return;
    }

    // Pre-measure once at gesture start. Pointer-move stays compositor/refs only
    // and never mixes layout reads into the hot path.
    const rects = tabRects();
    const origin = rects[index];
    if (!origin) return;
    const first = rects[0] ?? origin;
    const last = rects.at(-1) ?? origin;
    const originCenter = origin.left + origin.width / 2;
    const firstDelta = first.left + first.width / 2 - originCenter;
    const lastDelta = last.left + last.width / 2 - originCenter;
    const nextLayoutDirection = layoutDirectionFor(materialRef.current ?? event.currentTarget);
    const tabIcons = materialRef.current
      ? Array.from(materialRef.current.querySelectorAll<SVGElement>(".v3-liquid-tabbar__icon"))
      : [];
    setLayoutDirection((current) =>
      current === nextLayoutDirection ? current : nextLayoutDirection,
    );

    dragState.current = {
      pointerId: event.pointerId,
      captureTarget: event.currentTarget,
      startX: event.clientX,
      originIndex: index,
      previewIndex: index,
      moved: false,
      lastX: event.clientX,
      lastAt: event.timeStamp,
      velocityX: 0,
      minDelta: Math.min(firstDelta, lastDelta),
      maxDelta: Math.max(firstDelta, lastDelta),
      slotWidth: origin.width,
      layoutDirection: nextLayoutDirection,
      tabIcons,
    };
    lastPreviewHaptic.current = index;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setAppUpdateBlocker(
      V3_LIQUID_LENS_UPDATE_BLOCKER,
      true,
      "Finish the current navigation gesture before updating.",
    );
    beginHold(event.pointerId, event.clientX, event.clientY);
    setDragging(true);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLAnchorElement>) => {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    moveHold(event.pointerId, event.clientX, event.clientY);

    const rawDelta = event.clientX - drag.startX;
    const elapsed = Math.max(1, event.timeStamp - drag.lastAt);
    const instantVelocity = (event.clientX - drag.lastX) / elapsed;
    drag.velocityX = drag.velocityX * 0.68 + instantVelocity * 0.32;
    drag.lastX = event.clientX;
    drag.lastAt = event.timeStamp;

    const response = resolveElasticDrag({
      rawDelta,
      minDelta: drag.minDelta,
      maxDelta: drag.maxDelta,
      slotWidth: drag.slotWidth,
      rubberBand: true,
    });

    if (response.moved) drag.moved = true;
    const material = materialRef.current;
    material?.style.setProperty("--v3-liquid-drag-x", `${response.delta.toFixed(2)}px`);
    material?.style.setProperty("--v3-liquid-scale-x", response.scaleX.toFixed(4));
    material?.style.setProperty("--v3-liquid-pull-width", `${response.growWidth.toFixed(2)}px`);
    material?.style.setProperty("--v3-liquid-pull-height", `${response.growHeight.toFixed(2)}px`);
    material?.style.setProperty("--v3-liquid-pull-radius", `${response.growRadius.toFixed(2)}px`);
    material?.setAttribute("data-drag-direction", response.direction);

    const visualProgress = resolveV3NavigationVisualProgress({
      originIndex: drag.originIndex,
      physicalDelta: response.delta,
      slotWidth: drag.slotWidth,
      itemCount: destinations.length,
      direction: drag.layoutDirection,
    });
    for (let iconIndex = 0; iconIndex < drag.tabIcons.length; iconIndex += 1) {
      const icon = drag.tabIcons[iconIndex];
      if (!icon) continue;
      const visualState = resolveV3TabIconVisualState(iconIndex, visualProgress);
      icon.style.opacity = visualState.opacity.toFixed(4);
      icon.style.transform = `scale(${visualState.scale.toFixed(4)})`;
      icon.style.setProperty("stroke-width", visualState.strokeWidth.toFixed(4));
    }

    const nextPreview = resolveTabDragTargetIndex({
      rawDelta: resolveV3LogicalHorizontalDelta(rawDelta, drag.layoutDirection),
      originIndex: drag.originIndex,
      slotWidth: drag.slotWidth,
      itemCount: destinations.length,
      activationRatio: 0.62,
      maxSteps: 1,
    });
    if (nextPreview !== drag.previewIndex) {
      drag.previewIndex = nextPreview;
      setDragPreviewIndex(nextPreview);
    }

    if (drag.moved) event.preventDefault();
  };

  const selectDestination = (index: number) => {
    const destination = destinations[index];
    if (!destination) return;
    triggerSelectionHaptic();
    onSelect(destination);
  };

  const finishDrag = (event: ReactPointerEvent<HTMLAnchorElement>) => {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const targetIndex = resolveTabDragTargetIndex({
      rawDelta: resolveV3LogicalHorizontalDelta(
        event.clientX - drag.startX,
        drag.layoutDirection,
      ),
      velocityX: resolveV3LogicalHorizontalDelta(
        drag.velocityX,
        drag.layoutDirection,
      ),
      velocityProjectionMs: 110,
      originIndex: drag.originIndex,
      slotWidth: drag.slotWidth,
      itemCount: destinations.length,
      activationRatio: 0.72,
      maxSteps: 1,
    });
    const moved = drag.moved;
    const longPressed = held;
    suppressClick.current = moved || longPressed;

    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture may already have been released by the browser.
    }

    // A completed long press is tactile/deformational only. It must not fall
    // through into navigation on release.
    if (longPressed || !moved || targetIndex === drag.originIndex) {
      clearDrag();
      return;
    }

    settleDrag(targetIndex);
    selectDestination(targetIndex);
  };

  const cancelDrag = (event: ReactPointerEvent<HTMLAnchorElement>) => {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    suppressClick.current = drag.moved || held;
    clearDrag();
  };

  // Keep the decorative lens in a physical left-to-right coordinate system.
  // Flex item placement mirrors naturally in RTL, while route/gesture selection
  // stays logical. The lens layer is fully constrained and LTR so WebKit never
  // uses the lens itself as an absolutely-positioned RTL flex child.
  const physicalLensIndex =
    layoutDirection === "rtl" ? count - 1 - visualLensIndex : visualLensIndex;
  const totalGap = Math.max(0, count - 1) * 2;
  const indicatorStyle = {
    width: `calc((100% - 12px - ${totalGap}px) / ${count})`,
    left: "6px",
    right: "auto",
    direction: "ltr",
    transform: `translate3d(calc(${physicalLensIndex} * (100% + 2px) + var(--v3-liquid-drag-x)), 0, 0) scaleX(var(--v3-liquid-scale-x))`,
  } as CSSProperties;

  return (
    <nav
      ref={barRef}
      className={cn("v3-bottom-nav", "v3-liquid-tabbar")}
      aria-label="Primary app navigation"
      data-v3-liquid-tabbar=""
      data-collapsed={collapsed ? "true" : "false"}
      data-layout-direction={layoutDirection}
      onPointerDown={() => {
        if (collapsed) expand();
      }}
    >
      <div
        ref={materialRef}
        className="v3-liquid-tabbar__material"
        data-active-index={activeIndex}
        data-dragging={dragging ? "true" : "false"}
        data-held={held ? "true" : "false"}
        style={
          {
            gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
            ["--v3-liquid-drag-x" as string]: "0px",
            ["--v3-liquid-scale-x" as string]: "1",
            ["--v3-liquid-pull-width" as string]: "0px",
            ["--v3-liquid-pull-height" as string]: "0px",
            ["--v3-liquid-pull-radius" as string]: "0px",
          } as CSSProperties
        }
      >
        <KubeLiquidGlassBackdrop
          className="v3-liquid-tabbar__backdrop"
          sourceKey={`v3-tabbar:${pathname}`}
        />
        <span className="v3-liquid-tabbar__lens-layer" aria-hidden="true">
          <span
            className="v3-liquid-tabbar__lens"
            style={indicatorStyle}
            aria-hidden="true"
          />
        </span>

        {destinations.map((destination, index) => {
          const Icon = destination.icon;
          const active = destination.active;
          const visuallyActive = previewIndex === index;
          const badge = destination.badge ?? 0;

          return (
            <Link
              key={destination.id}
              to={destination.to as any}
              className="v3-liquid-tabbar__item"
              aria-current={active ? "page" : undefined}
              aria-label={navigationItemLabel(destination.label, badge)}
              data-v3-tab-index={index}
              data-active={active ? "true" : "false"}
              data-visual-active={visuallyActive ? "true" : "false"}
              data-emphasis={destination.emphasis ? "true" : undefined}
              onPointerDown={(event) => startDrag(event, index, active)}
              onPointerMove={moveDrag}
              onPointerUp={finishDrag}
              onPointerCancel={cancelDrag}
              onLostPointerCapture={cancelDrag}
              onClick={(event) => {
                if (suppressClick.current) {
                  suppressClick.current = false;
                  event.preventDefault();
                  return;
                }

                const wasCollapsed = collapsed;
                expand();
                if (wasCollapsed && active) {
                  event.preventDefault();
                  return;
                }

                event.preventDefault();
                selectDestination(index);
              }}
            >
              <span className="v3-liquid-tabbar__icon-wrap" aria-hidden="true">
                <Icon className="v3-liquid-tabbar__icon" />
                {badge > 0 ? (
                  <span className="v3-liquid-tabbar__badge">
                    {badge > 9 ? "9+" : badge}
                  </span>
                ) : null}
              </span>
              <span className="v3-liquid-tabbar__label">{destination.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
