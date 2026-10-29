import { Link } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { LucideIcon } from "lucide-react";

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
import type { SolarisTabbarMode } from "@/lib/solaris-screen-contract";
import { cn } from "@/lib/utils";
import "@/styles/v3-organizer-navigation.css";

const V3_ORGANIZER_LENS_UPDATE_BLOCKER = "v3-organizer-lens-drag";

export type OrganizerV6TabItem = {
  id: string;
  label: string;
  href: string | null;
  availability: "ready" | "requires-edition";
  unavailableReason?: string;
  icon: LucideIcon;
  active: boolean;
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

function organizerItemLabel(item: OrganizerV6TabItem) {
  const badge = item.badge ?? 0;
  if (badge <= 0) return item.label;
  return `${item.label}, ${badge} unresolved item${badge === 1 ? "" : "s"}`;
}

function layoutDirectionFor(element: Element): V3LayoutDirection {
  return getComputedStyle(element).direction === "rtl" ? "rtl" : "ltr";
}

export function OrganizerV6TabBar({
  pathname,
  items,
  onSelect,
  mode = "full",
}: {
  pathname: string;
  items: readonly OrganizerV6TabItem[];
  onSelect: (item: OrganizerV6TabItem) => void;
  mode?: SolarisTabbarMode;
}) {
  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.active),
  );
  const [dragPreviewIndex, setDragPreviewIndex] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [layoutDirection, setLayoutDirection] = useState<V3LayoutDirection>("ltr");
  const barRef = useRef<HTMLElement | null>(null);
  const materialRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<DragState | null>(null);
  const suppressClick = useRef(false);
  const { held, begin: beginHold, move: moveHold, end: endHold } = useSolarisPressHold();
  const { collapsed, expand } = useScrollResponsiveBar({
    enabled: true,
    resetKey: pathname,
  });

  const visualActiveIndex = dragging ? activeIndex : (dragPreviewIndex ?? activeIndex);
  const compact = collapsed || mode === "compact";

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
        window.innerWidth >= 720 ||
        mode === "hidden" ||
        root.hasAttribute("data-solaris-keyboard-open")
      ) {
        root.style.setProperty("--solaris-bottom-obstruction", "0px");
        return;
      }
      const rect = bar.getBoundingClientRect();
      const obstruction = Math.min(128, Math.max(0, window.innerHeight - rect.top));
      root.style.setProperty("--solaris-bottom-obstruction", `${Math.ceil(obstruction)}px`);
    };

    sync();
    const observer = typeof ResizeObserver !== "undefined" && bar ? new ResizeObserver(sync) : null;
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
  }, [collapsed, mode, pathname]);

  useEffect(
    () => () => {
      window.requestAnimationFrame(() => {
        if (
          document.querySelector(
            "[data-v3-organizer-tabbar], [data-v3-liquid-tabbar], .solaris-app-tabbar",
          )
        ) {
          return;
        }
        document.documentElement.style.setProperty("--solaris-bottom-obstruction", "0px");
      });
    },
    [],
  );

  const tabRects = () => {
    const material = materialRef.current;
    if (!material) return [];
    return Array.from(material.querySelectorAll<HTMLElement>("[data-organizer-tab-index]")).map(
      (element) => element.getBoundingClientRect(),
    );
  };

  const resetDragDom = useCallback(() => {
    clearAppUpdateBlocker(V3_ORGANIZER_LENS_UPDATE_BLOCKER);
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
    material?.style.setProperty("--organizer-tab-drag-x", "0px");
    material?.style.setProperty("--organizer-tab-scale-x", "1");
    material?.style.setProperty("--organizer-bar-grow", "0px");
    material?.removeAttribute("data-drag-direction");
    dragState.current = null;
  }, []);

  const clearDrag = useCallback(() => {
    endHold();
    resetDragDom();
    setDragging(false);
    setDragPreviewIndex(null);
  }, [endHold, resetDragDom]);

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
      ? Array.from(materialRef.current.querySelectorAll<SVGElement>("[data-organizer-tab-index] svg"))
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
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setAppUpdateBlocker(
      V3_ORGANIZER_LENS_UPDATE_BLOCKER,
      true,
      "Finish the current Organizer navigation gesture before updating.",
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
    material?.style.setProperty("--organizer-tab-drag-x", `${response.delta}px`);
    material?.style.setProperty("--organizer-tab-scale-x", response.scaleX.toFixed(4));
    material?.style.setProperty("--organizer-bar-grow", `${response.growHeight.toFixed(2)}px`);
    material?.setAttribute("data-drag-direction", response.direction);

    const visualProgress = resolveV3NavigationVisualProgress({
      originIndex: drag.originIndex,
      physicalDelta: response.delta,
      slotWidth: drag.slotWidth,
      itemCount: items.length,
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

    const previewIndex = resolveTabDragTargetIndex({
      rawDelta: resolveV3LogicalHorizontalDelta(rawDelta, drag.layoutDirection),
      originIndex: drag.originIndex,
      slotWidth: drag.slotWidth,
      itemCount: items.length,
      activationRatio: 0.62,
      maxSteps: 1,
    });
    if (previewIndex !== drag.previewIndex) {
      drag.previewIndex = previewIndex;
      setDragPreviewIndex(previewIndex);
    }
    if (drag.moved) event.preventDefault();
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
      itemCount: items.length,
      activationRatio: 0.72,
      maxSteps: 1,
    });
    const longPressed = held;
    suppressClick.current = drag.moved || longPressed;

    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture may already have been released by the browser.
    }

    clearDrag();
    if (longPressed || !drag.moved || targetIndex === drag.originIndex) return;
    const target = items[targetIndex];
    if (target) onSelect(target);
  };

  const cancelDrag = (event: ReactPointerEvent<HTMLAnchorElement>) => {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    suppressClick.current = drag.moved || held;
    clearDrag();
  };

  const count = Math.max(1, items.length);
  // Organizer shares Public's physical lens overlay model. The outer material
  // keeps logical RTL for tab placement while the fully constrained LTR layer
  // prevents WebKit from static-positioning the lens as an RTL flex child.
  const physicalLensIndex =
    layoutDirection === "rtl" ? count - 1 - visualActiveIndex : visualActiveIndex;
  const indicatorStyle = {
    width: `calc((100% - .75rem - ${Math.max(0, count - 1) * 0.15}rem) / ${count})`,
    left: ".375rem",
    right: "auto",
    direction: "ltr",
    transform: `translate3d(calc(${physicalLensIndex} * (100% + .15rem) + var(--organizer-tab-drag-x)), -50%, 0) scaleX(var(--organizer-tab-scale-x))`,
  } as CSSProperties;

  if (mode === "hidden") return null;

  return (
    <nav
      ref={barRef}
      className="admin-mobile-nav fixed inset-x-0 bottom-0 z-[var(--solaris-z-tabbar)] px-2"
      style={{
        paddingBottom:
          "max(.45rem, var(--solaris-safe-bottom, env(safe-area-inset-bottom, 0px)))",
      }}
      aria-label="Organizer navigation"
      data-v6-organizer-tabbar=""
      data-v3-organizer-tabbar=""
      data-mode={mode}
      data-collapsed={compact ? "true" : "false"}
      data-layout-direction={layoutDirection}
      onPointerDown={() => {
        if (collapsed) expand();
      }}
    >
      <div
        ref={materialRef}
        className={cn(
          "relative mx-auto grid max-w-xl overflow-hidden rounded-[1.45rem] border border-white/[0.14]",
          "bg-[#06101f]/80 p-[.375rem] shadow-[0_12px_34px_rgba(0,0,0,.2)] backdrop-blur-2xl",
          "transition-[height,border-radius,transform] duration-200 ease-out motion-reduce:transition-none",
          compact ? "h-[3.5rem]" : "h-[4.7rem]",
          held && "scale-x-[1.01] scale-y-[1.025]",
        )}
        style={
          {
            gridTemplateColumns: `repeat(${count}, minmax(0,1fr))`,
            gap: ".15rem",
            ["--organizer-tab-drag-x" as string]: "0px",
            ["--organizer-tab-scale-x" as string]: "1",
            ["--organizer-bar-grow" as string]: "0px",
          } as CSSProperties
        }
        data-dragging={dragging ? "true" : "false"}
        data-held={held ? "true" : "false"}
      >
        <KubeLiquidGlassBackdrop
          className="pointer-events-none absolute inset-0 size-full rounded-[inherit]"
          sourceKey={`organizer:${pathname}`}
        />
        <span className="v6-organizer-tabbar__lens-layer" aria-hidden="true">
          <span
            className={cn(
              "v6-organizer-tabbar__lens pointer-events-none absolute left-[.375rem] top-1/2 z-[1] rounded-[1rem] bg-white/[0.075]",
              "transition-transform duration-200 ease-out motion-reduce:transition-none",
              compact ? "h-[2.75rem]" : "h-[3.7rem]",
              dragging && "transition-none",
            )}
            style={indicatorStyle}
            aria-hidden="true"
          />
        </span>

        {items.map((item, index) => {
          const Icon = item.icon;
          const content = (
            <>
              <span className="relative">
                <Icon className="size-[1.08rem]" aria-hidden="true" />
                {(item.badge ?? 0) > 0 ? (
                  <span
                    className={cn(
                      "absolute -top-2 min-w-4 rounded-full border border-[#06101f] bg-rose-500 px-1 text-center text-[8px] font-bold leading-4 text-white",
                      layoutDirection === "rtl" ? "-left-3" : "-right-3",
                    )}
                    aria-hidden="true"
                  >
                    {(item.badge ?? 0) > 99 ? "99+" : item.badge}
                  </span>
                ) : null}
              </span>
              <span className={cn("w-full truncate text-center", compact && "sr-only")}>
                {item.label}
              </span>
            </>
          );
          const tabClassName = cn(
            "relative z-[2] flex min-h-[44px] min-w-0 items-center justify-center rounded-[1rem] px-1",
            "text-[11px] font-semibold transition-[color,transform] duration-150",
            "active:scale-[0.96] motion-reduce:active:scale-100",
            compact ? "flex-row" : "flex-col gap-1",
            item.active ? "text-sky-50" : "text-muted-foreground",
          );

          return item.availability === "ready" && item.href ? (
            <Link
              key={item.id}
              to={item.href as any}
              aria-label={organizerItemLabel(item)}
              aria-current={item.active ? "page" : undefined}
              data-organizer-tab-index={index}
              onPointerDown={(event) => startDrag(event, index, item.active)}
              onPointerMove={moveDrag}
              onPointerUp={finishDrag}
              onPointerCancel={cancelDrag}
              onLostPointerCapture={cancelDrag}
              onClick={(event) => {
                event.preventDefault();
                if (suppressClick.current) {
                  suppressClick.current = false;
                  return;
                }
                const wasCollapsed = collapsed;
                expand();
                if (wasCollapsed && item.active) return;
                onSelect(item);
              }}
              className={tabClassName}
            >
              {content}
            </Link>
          ) : (
            <span
              key={item.id}
              aria-label={organizerItemLabel(item)}
              aria-disabled="true"
              title={item.unavailableReason}
              data-organizer-tab-index={index}
              className={cn(tabClassName, "cursor-not-allowed opacity-55")}
            >
              {content}
            </span>
          );
        })}
      </div>
    </nav>
  );
}
