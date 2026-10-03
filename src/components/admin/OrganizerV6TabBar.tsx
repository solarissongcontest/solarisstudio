import { Link } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { LucideIcon } from "lucide-react";

import { KubeLiquidGlassBackdrop } from "@/components/app/KubeLiquidGlassBackdrop";
import { resolveElasticDrag } from "@/lib/interaction-physics";
import { useScrollResponsiveBar } from "@/lib/use-scroll-responsive-bar";
import { cn } from "@/lib/utils";

export type OrganizerV6TabItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  active: boolean;
  badge?: number;
};

type DragState = {
  pointerId: number;
  startX: number;
  originIndex: number;
  moved: boolean;
};

export function OrganizerV6TabBar({
  pathname,
  items,
  onSelect,
}: {
  pathname: string;
  items: readonly OrganizerV6TabItem[];
  onSelect: (item: OrganizerV6TabItem) => void;
}) {
  const activeIndex = Math.max(0, items.findIndex((item) => item.active));
  const [dragPreviewIndex, setDragPreviewIndex] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const barRef = useRef<HTMLElement | null>(null);
  const materialRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<DragState | null>(null);
  const suppressClick = useRef(false);
  const { collapsed, expand } = useScrollResponsiveBar({
    enabled: true,
    resetKey: pathname,
  });

  const visualActiveIndex = dragPreviewIndex ?? activeIndex;

  useEffect(() => {
    const root = document.documentElement;
    const bar = barRef.current;

    const sync = () => {
      if (!bar || window.innerWidth >= 720) {
        root.style.setProperty("--solaris-bottom-obstruction", "0px");
        return;
      }
      const rect = bar.getBoundingClientRect();
      const obstruction = Math.min(
        128,
        Math.max(0, window.innerHeight - rect.top),
      );
      root.style.setProperty(
        "--solaris-bottom-obstruction",
        `${Math.ceil(obstruction)}px`,
      );
    };

    sync();
    const observer =
      typeof ResizeObserver !== "undefined" && bar
        ? new ResizeObserver(sync)
        : null;
    if (observer && bar) observer.observe(bar);
    window.addEventListener("resize", sync);
    window.visualViewport?.addEventListener("resize", sync);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("resize", sync);
      root.style.setProperty("--solaris-bottom-obstruction", "0px");
    };
  }, [collapsed, pathname]);

  const tabRects = () => {
    const material = materialRef.current;
    if (!material) return [];
    return Array.from(
      material.querySelectorAll<HTMLElement>("[data-organizer-tab-index]"),
    ).map((element) => element.getBoundingClientRect());
  };

  const nearestTabIndex = (clientX: number) => {
    const rects = tabRects();
    if (!rects.length) return activeIndex;
    let nearest = activeIndex;
    let nearestDistance = Number.POSITIVE_INFINITY;
    rects.forEach((rect, index) => {
      const center = rect.left + rect.width / 2;
      const distance = Math.abs(clientX - center);
      if (distance < nearestDistance) {
        nearest = index;
        nearestDistance = distance;
      }
    });
    return nearest;
  };

  const clearDrag = useCallback(() => {
    const material = materialRef.current;
    material?.style.setProperty("--organizer-tab-drag-x", "0px");
    material?.style.setProperty("--organizer-tab-scale-x", "1");
    material?.style.setProperty("--organizer-bar-grow", "0px");
    material?.removeAttribute("data-drag-direction");
    dragState.current = null;
    setDragging(false);
    setDragPreviewIndex(null);
  }, []);

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
      clearDrag();
    };
  }, [clearDrag, pathname]);

  const startDrag = (
    event: ReactPointerEvent<HTMLAnchorElement>,
    index: number,
    active: boolean,
  ) => {
    if (
      !active ||
      collapsed ||
      (event.pointerType === "mouse" && event.button !== 0)
    ) {
      return;
    }

    dragState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      originIndex: index,
      moved: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging(true);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLAnchorElement>) => {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const rects = tabRects();
    const origin = rects[drag.originIndex];
    if (!origin) return;
    const first = rects[0] ?? origin;
    const last = rects.at(-1) ?? origin;
    const originCenter = origin.left + origin.width / 2;
    const response = resolveElasticDrag({
      rawDelta: event.clientX - drag.startX,
      minDelta: first.left + first.width / 2 - originCenter,
      maxDelta: last.left + last.width / 2 - originCenter,
      slotWidth: origin.width,
    });

    if (response.moved) drag.moved = true;
    const material = materialRef.current;
    material?.style.setProperty("--organizer-tab-drag-x", `${response.delta}px`);
    material?.style.setProperty("--organizer-tab-scale-x", response.scaleX.toFixed(4));
    material?.style.setProperty("--organizer-bar-grow", `${response.growHeight.toFixed(2)}px`);
    material?.setAttribute("data-drag-direction", response.direction);

    setDragPreviewIndex(nearestTabIndex(event.clientX));
    if (drag.moved) event.preventDefault();
  };

  const finishDrag = (event: ReactPointerEvent<HTMLAnchorElement>) => {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const targetIndex = nearestTabIndex(event.clientX);
    suppressClick.current = drag.moved;

    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // Browser may already have released pointer capture.
    }

    clearDrag();
    if (!drag.moved || targetIndex === drag.originIndex) return;
    const target = items[targetIndex];
    if (target) onSelect(target);
  };

  const cancelDrag = (event: ReactPointerEvent<HTMLAnchorElement>) => {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    suppressClick.current = drag.moved;
    clearDrag();
  };

  const count = Math.max(1, items.length);
  const indicatorStyle = {
    width: `calc((100% - .75rem - ${Math.max(0, count - 1) * 0.15}rem) / ${count})`,
    transform: `translate3d(calc(${visualActiveIndex} * (100% + .15rem) + var(--organizer-tab-drag-x)), -50%, 0) scaleX(var(--organizer-tab-scale-x))`,
  } as CSSProperties;

  return (
    <nav
      ref={barRef}
      className="admin-mobile-nav fixed inset-x-0 bottom-0 z-[var(--solaris-z-tabbar)] px-2"
      style={{ paddingBottom: "max(.45rem, env(safe-area-inset-bottom))" }}
      aria-label="Organizer navigation"
      data-v6-organizer-tabbar=""
      data-collapsed={collapsed ? "true" : "false"}
      onPointerDown={() => {
        if (collapsed) expand();
      }}
    >
      <div
        ref={materialRef}
        className={cn(
          "relative mx-auto grid max-w-xl overflow-hidden rounded-[1.45rem] border border-white/[0.14]",
          "bg-[#06101f]/80 p-[.375rem] shadow-[0_12px_34px_rgba(0,0,0,.2)] backdrop-blur-2xl",
          "transition-[height,border-radius] duration-200 ease-out motion-reduce:transition-none",
          collapsed ? "h-[3.35rem]" : "h-[4.7rem]",
        )}
        style={{
          gridTemplateColumns: `repeat(${count}, minmax(0,1fr))`,
          gap: ".15rem",
          ["--organizer-tab-drag-x" as string]: "0px",
          ["--organizer-tab-scale-x" as string]: "1",
          ["--organizer-bar-grow" as string]: "0px",
        } as CSSProperties}
        data-dragging={dragging ? "true" : "false"}
      >
        <KubeLiquidGlassBackdrop
          className="pointer-events-none absolute inset-0 size-full rounded-[inherit]"
          sourceKey={`organizer:${pathname}`}
        />
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute left-[.375rem] top-1/2 z-[1] rounded-[1rem] bg-white/[0.075]",
            "transition-transform duration-200 ease-out motion-reduce:transition-none",
            collapsed ? "h-[2.55rem]" : "h-[3.7rem]",
            dragging && "transition-none",
          )}
          style={indicatorStyle}
        />

        {items.map((item, index) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              to={item.href as any}
              aria-label={item.label}
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
              className={cn(
                "relative z-[2] flex min-w-0 items-center justify-center rounded-[1rem] px-1",
                "text-[11px] font-semibold transition-[color,transform] duration-150",
                "active:scale-[0.96] motion-reduce:active:scale-100",
                collapsed ? "flex-row" : "flex-col gap-1",
                item.active ? "text-sky-50" : "text-muted-foreground",
              )}
            >
              <span className="relative">
                <Icon className="size-[1.08rem]" aria-hidden="true" />
                {(item.badge ?? 0) > 0 ? (
                  <span
                    className="absolute -right-3 -top-2 min-w-4 rounded-full border border-[#06101f] bg-rose-500 px-1 text-center text-[8px] font-bold leading-4 text-white"
                    aria-label={`${item.badge} unresolved item${item.badge === 1 ? "" : "s"}`}
                  >
                    {(item.badge ?? 0) > 99 ? "99+" : item.badge}
                  </span>
                ) : null}
              </span>
              <span className={cn("w-full truncate text-center", collapsed && "sr-only")}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
