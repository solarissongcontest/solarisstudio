import { Link, useNavigate } from "@tanstack/react-router";
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
import { runAppViewTransition } from "@/lib/app-view-transitions";
import {
  prefersReducedMotion,
  resolveElasticDrag,
  resolveTabDragTargetIndex,
} from "@/lib/interaction-physics";
import { useScrollResponsiveBar } from "@/lib/use-scroll-responsive-bar";
import { useSolarisPressHold } from "@/lib/use-solaris-press-hold";
import { cn } from "@/lib/utils";
import "@/styles/v3-liquid-tabbar.css";

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
  startX: number;
  originIndex: number;
  moved: boolean;
  lastX: number;
  lastAt: number;
  velocityX: number;
};

function triggerSelectionHaptic(duration = 8) {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  navigator.vibrate(duration);
}

/**
 * V3's premium mobile navigation surface.
 *
 * The semantic links remain the navigation authority. Direct manipulation is a
 * progressive enhancement layered on top: scroll compaction, a refractive
 * selection lens, press/hold material deformation and elastic drag selection.
 * Reduced-motion users keep the same destinations without drag-dependent UI.
 */
export function V3LiquidTabBar({
  pathname,
  destinations,
}: {
  pathname: string;
  destinations: readonly V3LiquidTabDestination[];
}) {
  const navigate = useNavigate();
  const activeIndex = Math.max(
    0,
    destinations.findIndex((destination) => destination.active),
  );
  const [dragPreviewIndex, setDragPreviewIndex] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
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

    const sync = () => {
      if (!bar) return;
      const rect = bar.getBoundingClientRect();
      const obstruction = Math.min(136, Math.max(0, window.innerHeight - rect.top) + 10);
      root.style.setProperty("--v3-bottom-obstruction", `${Math.ceil(obstruction)}px`);
      root.style.setProperty("--solaris-bottom-obstruction", `${Math.ceil(obstruction)}px`);
    };

    sync();
    const observer =
      typeof ResizeObserver !== "undefined" && bar ? new ResizeObserver(sync) : null;
    if (observer && bar) observer.observe(bar);
    window.addEventListener("resize", sync);
    window.visualViewport?.addEventListener("resize", sync);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("resize", sync);
    };
  }, [collapsed, pathname]);

  useEffect(
    () => () => {
      window.requestAnimationFrame(() => {
        if (document.querySelector("[data-v3-liquid-tabbar]")) return;
        const root = document.documentElement;
        root.style.removeProperty("--v3-bottom-obstruction");
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

  const settleDrag = useCallback((targetIndex: number) => {
    endHold();
    resetDragDom();
    setDragging(false);
    setDragPreviewIndex(targetIndex);
  }, [endHold, resetDragDom]);

  useEffect(() => {
    const resetInterruptedGesture = () => clearDrag();
    const resetWhenHidden = () => {
      if (document.visibilityState !== "visible") clearDrag();
    };

    window.addEventListener("blur", resetInterruptedGesture);
    window.addEventListener("orientationchange", resetInterruptedGesture);
    document.addEventListener("visibilitychange", resetWhenHidden);

    return () => {
      window.removeEventListener("blur", resetInterruptedGesture);
      window.removeEventListener("orientationchange", resetInterruptedGesture);
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
      (event.pointerType === "mouse" && event.button !== 0)
    ) {
      return;
    }

    dragState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      originIndex: index,
      moved: false,
      lastX: event.clientX,
      lastAt: event.timeStamp,
      velocityX: 0,
    };
    lastPreviewHaptic.current = index;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    beginHold(event.pointerId, event.clientX, event.clientY);
    setDragging(true);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLAnchorElement>) => {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    moveHold(event.pointerId, event.clientX, event.clientY);

    const rects = tabRects();
    const origin = rects[drag.originIndex];
    if (!origin) return;
    const first = rects[0] ?? origin;
    const last = rects.at(-1) ?? origin;
    const originCenter = origin.left + origin.width / 2;
    const rawDelta = event.clientX - drag.startX;
    const elapsed = Math.max(1, event.timeStamp - drag.lastAt);
    const instantVelocity = (event.clientX - drag.lastX) / elapsed;
    drag.velocityX = drag.velocityX * 0.68 + instantVelocity * 0.32;
    drag.lastX = event.clientX;
    drag.lastAt = event.timeStamp;

    const response = resolveElasticDrag({
      rawDelta,
      minDelta: first.left + first.width / 2 - originCenter,
      maxDelta: last.left + last.width / 2 - originCenter,
      slotWidth: origin.width,
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

    const nextPreview = resolveTabDragTargetIndex({
      rawDelta,
      originIndex: drag.originIndex,
      slotWidth: origin.width,
      itemCount: destinations.length,
      activationRatio: 0.62,
    });
    setDragPreviewIndex((current) => (current === nextPreview ? current : nextPreview));

    if (drag.moved) event.preventDefault();
  };

  const selectDestination = (index: number) => {
    const destination = destinations[index];
    if (!destination) return;
    triggerSelectionHaptic();
    void runAppViewTransition("tab", () => navigate({ to: destination.to as any }));
  };

  const finishDrag = (event: ReactPointerEvent<HTMLAnchorElement>) => {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const rects = tabRects();
    const origin = rects[drag.originIndex];
    const targetIndex = resolveTabDragTargetIndex({
      rawDelta: event.clientX - drag.startX,
      velocityX: drag.velocityX,
      velocityProjectionMs: 110,
      originIndex: drag.originIndex,
      slotWidth: origin?.width ?? 1,
      itemCount: destinations.length,
      activationRatio: 0.72,
    });
    const moved = drag.moved;
    suppressClick.current = moved;

    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture may already have been released by the browser.
    }

    if (!moved || targetIndex === drag.originIndex) {
      clearDrag();
      return;
    }

    settleDrag(targetIndex);
    selectDestination(targetIndex);
  };

  const cancelDrag = (event: ReactPointerEvent<HTMLAnchorElement>) => {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    suppressClick.current = drag.moved;
    clearDrag();
  };

  const indicatorStyle = {
    width: `calc((100% - .76rem - ${Math.max(0, count - 1) * 0.14}rem) / ${count})`,
    transform: `translate3d(calc(${visualLensIndex} * (100% + .14rem) + var(--v3-liquid-drag-x)), 0, 0) scaleX(var(--v3-liquid-scale-x))`,
  } as CSSProperties;

  return (
    <nav
      ref={barRef}
      className={cn("v3-bottom-nav", "v3-liquid-tabbar")}
      aria-label="Primary app navigation"
      data-v3-liquid-tabbar=""
      data-collapsed={collapsed ? "true" : "false"}
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
        <span
          className="v3-liquid-tabbar__lens"
          style={indicatorStyle}
          aria-hidden="true"
        />

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
              aria-label={destination.label}
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
                if (active) {
                  window.scrollTo({
                    top: 0,
                    behavior: prefersReducedMotion() ? "auto" : "smooth",
                  });
                  triggerSelectionHaptic(5);
                  return;
                }
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
