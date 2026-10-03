import { Link, useNavigate } from "@tanstack/react-router";
import { Compass, Home, Trophy, UserRound, Vote, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { KubeLiquidGlassBackdrop } from "@/components/app/KubeLiquidGlassBackdrop";
import {
  appEntryHref,
  appTabRoot,
  getAppTabDestination,
  markAppNavigationRestore,
  resetAppTabToRoot,
} from "@/lib/app-navigation";
import { runAppViewTransition } from "@/lib/app-view-transitions";
import { resolveAppRouteChrome } from "@/lib/app-route-chrome";
import {
  prefersReducedMotion,
  resolveElasticDrag,
} from "@/lib/interaction-physics";
import { useScrollResponsiveBar } from "@/lib/use-scroll-responsive-bar";
import { PUBLIC_GLOBAL_AREAS } from "@/lib/public-navigation";
import { trackPublicUxEvent } from "@/lib/public-ux-events";
import { cn } from "@/lib/utils";

const ICONS: Record<(typeof PUBLIC_GLOBAL_AREAS)[number]["id"], LucideIcon> = {
  home: Home,
  explore: Compass,
  participate: Vote,
  results: Trophy,
  me: UserRound,
};

type PrimaryArea = (typeof PUBLIC_GLOBAL_AREAS)[number]["id"];

type DragState = {
  pointerId: number;
  startX: number;
  originIndex: number;
  moved: boolean;
};

function isPrimaryArea(value: string): value is PrimaryArea {
  return PUBLIC_GLOBAL_AREAS.some((area) => area.id === value);
}

function rootDestinationForIndex(index: number, signedIn: boolean) {
  const area = PUBLIC_GLOBAL_AREAS[index];
  if (!area) return null;
  return appTabRoot(area.id, signedIn);
}

export function AppTabBar({
  pathname,
  searchStr = "",
  signedIn,
  participateBadge = 0,
  meBadge = 0,
}: {
  pathname: string;
  searchStr?: string;
  signedIn: boolean;
  participateBadge?: number;
  meBadge?: number;
}) {
  const navigate = useNavigate();
  const chrome = resolveAppRouteChrome(pathname, searchStr);
  const routeArea: PrimaryArea =
    chrome.tab && isPrimaryArea(chrome.tab) ? chrome.tab : "home";
  const tabbarMode = chrome.tabBar;
  const [railMode, setRailMode] = useState(false);
  const [dragPreviewIndex, setDragPreviewIndex] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const { collapsed, expand: expandTabBar } = useScrollResponsiveBar({
    enabled: !railMode,
    resetKey: `${pathname}|${routeArea}|${searchStr}`,
  });
  const barRef = useRef<HTMLElement | null>(null);
  const materialRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<DragState | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 900px)");
    const refresh = () => {
      setRailMode(media.matches);
      if (media.matches) expandTabBar();
    };
    refresh();
    media.addEventListener?.("change", refresh);
    return () => media.removeEventListener?.("change", refresh);
  }, [expandTabBar]);

  useEffect(() => {
    const root = document.documentElement;
    const bar = barRef.current;

    const updateMetrics = () => {
      if (!bar || railMode || tabbarMode === "hidden") {
        root.style.setProperty("--solaris-app-bottom-obstruction", "0px");
        root.style.setProperty("--solaris-bottom-obstruction", "0px");
        return;
      }

      const rect = bar.getBoundingClientRect();
      // This value is deliberately output-only. Never feed a measured tab-bar
      // height back into the CSS variable that sizes the tab bar itself:
      // doing so creates a ResizeObserver feedback loop when drag elasticity
      // temporarily changes the material height.
      const rawObstruction = Math.max(0, window.innerHeight - rect.top);
      const obstruction = Math.min(rawObstruction, 128);
      root.style.setProperty("--solaris-app-bottom-obstruction", `${Math.ceil(obstruction)}px`);
      root.style.setProperty("--solaris-bottom-obstruction", `${Math.ceil(obstruction)}px`);
    };

    updateMetrics();
    const observer =
      typeof ResizeObserver !== "undefined" && bar
        ? new ResizeObserver(updateMetrics)
        : null;
    if (observer && bar) observer.observe(bar as Element);
    window.addEventListener("resize", updateMetrics);
    window.visualViewport?.addEventListener("resize", updateMetrics);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateMetrics);
      window.visualViewport?.removeEventListener("resize", updateMetrics);
      root.style.setProperty("--solaris-app-bottom-obstruction", "0px");
      root.style.setProperty("--solaris-bottom-obstruction", "0px");
    };
  }, [collapsed, railMode, tabbarMode, pathname]);

  const activeArea: PrimaryArea = routeArea;
  const activeIndex = Math.max(
    0,
    PUBLIC_GLOBAL_AREAS.findIndex((area) => area.id === activeArea),
  );
  const visualActiveIndex = dragPreviewIndex ?? activeIndex;

  const openTab = (index: number) => {
    const area = PUBLIC_GLOBAL_AREAS[index];
    if (!area) return;
    const target = getAppTabDestination(area.id, signedIn);
    const root = appTabRoot(area.id, signedIn);
    if (appEntryHref(target) !== root || target.scrollY > 0) {
      trackPublicUxEvent("app_tab_restored", {
        target: appEntryHref(target),
        metadata: {
          area: area.id,
          source: "app_tabbar",
        },
      });
    }
    markAppNavigationRestore(target);
    void runAppViewTransition("tab", () =>
      navigate({ to: appEntryHref(target) as any }),
    );
  };

  const activateCurrentTab = (index: number) => {
    const area = PUBLIC_GLOBAL_AREAS[index];
    if (!area) return;
    const root = appTabRoot(area.id, signedIn);
    const normalizedPath = pathname.endsWith("/") && pathname !== "/" ? pathname.slice(0, -1) : pathname;
    const normalizedRoot = root.endsWith("/") && root !== "/" ? root.slice(0, -1) : root;

    if (normalizedPath !== normalizedRoot) {
      const target = resetAppTabToRoot(area.id, signedIn);
      void runAppViewTransition("pop", () =>
        navigate({ to: appEntryHref(target) as any }),
      );
      return;
    }

    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  };

  const tabRects = () => {
    const material = materialRef.current;
    if (!material) return [];
    return Array.from(material.querySelectorAll<HTMLElement>("[data-app-tab-index]")).map(
      (element) => element.getBoundingClientRect(),
    );
  };

  const nearestTabIndex = (clientX: number) => {
    const rects = tabRects();
    if (!rects.length) return activeIndex;
    let nearest = 0;
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
    material?.style.setProperty("--solaris-tab-drag-x", "0px");
    material?.style.setProperty("--solaris-tab-drag-scale-x", "1");
    material?.style.setProperty("--solaris-tabbar-pull-width", "0px");
    material?.style.setProperty("--solaris-tabbar-pull-height", "0px");
    material?.style.setProperty("--solaris-tabbar-pull-radius", "0px");
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
  }, [clearDrag, pathname, searchStr]);

  const startDrag = (
    event: ReactPointerEvent<HTMLAnchorElement>,
    index: number,
    active: boolean,
  ) => {
    if (
      !active ||
      collapsed ||
      railMode ||
      (event.pointerType === "mouse" && event.button !== 0)
    ) return;

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

    const originCenter = origin.left + origin.width / 2;
    const minCenter = rects[0] ? rects[0].left + rects[0].width / 2 : originCenter;
    const lastRect = rects[rects.length - 1];
    const maxCenter = lastRect ? lastRect.left + lastRect.width / 2 : originCenter;
    const response = resolveElasticDrag({
      rawDelta: event.clientX - drag.startX,
      minDelta: minCenter - originCenter,
      maxDelta: maxCenter - originCenter,
      slotWidth: origin.width,
    });

    if (response.moved) drag.moved = true;
    const material = materialRef.current;
    material?.style.setProperty("--solaris-tab-drag-x", `${response.delta}px`);
    material?.style.setProperty("--solaris-tab-drag-scale-x", response.scaleX.toFixed(4));
    material?.style.setProperty("--solaris-tabbar-pull-width", `${response.growWidth.toFixed(2)}px`);
    material?.style.setProperty("--solaris-tabbar-pull-height", `${response.growHeight.toFixed(2)}px`);
    material?.style.setProperty("--solaris-tabbar-pull-radius", `${response.growRadius.toFixed(2)}px`);
    material?.setAttribute("data-drag-direction", response.direction);

    const preview = nearestTabIndex(event.clientX);
    setDragPreviewIndex((current) => (current === preview ? current : preview));

    if (drag.moved) event.preventDefault();
  };

  const finishDrag = (event: ReactPointerEvent<HTMLAnchorElement>) => {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const targetIndex = nearestTabIndex(event.clientX);
    const moved = drag.moved;
    suppressClick.current = moved;

    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture may already have been released by the browser.
    }

    clearDrag();

    if (!moved || targetIndex === drag.originIndex) return;
    const area = PUBLIC_GLOBAL_AREAS[targetIndex];
    if (!area) return;
    const target = getAppTabDestination(area.id, signedIn);

    trackPublicUxEvent("public_nav_clicked", {
      target: appEntryHref(target),
      metadata: { area: area.id, source: "app_tabbar_drag" },
    });
    openTab(targetIndex);
  };

  const cancelDrag = (event: ReactPointerEvent<HTMLAnchorElement>) => {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    suppressClick.current = drag.moved;
    clearDrag();
  };

  if (tabbarMode === "hidden") return null;

  return (
    <nav
      ref={barRef}
      className={cn(
        "solaris-app-tabbar",
        collapsed && "is-collapsed",
        tabbarMode === "minimal" && "is-minimal",
      )}
      aria-label="Solaris Studio"
      data-collapsed={collapsed ? "true" : "false"}
      data-layout={railMode ? "rail" : "bar"}
      data-mode={tabbarMode}
      onPointerDown={() => {
        if (collapsed) expandTabBar();
      }}
    >
      <div
        ref={materialRef}
        className="solaris-app-tabbar-material"
        data-active-index={activeIndex}
        data-dragging={dragging ? "true" : "false"}
      >
        <KubeLiquidGlassBackdrop className="solaris-app-tabbar-backdrop" sourceKey={pathname} />
        <span className="solaris-app-tab-indicator" aria-hidden="true" />

        {PUBLIC_GLOBAL_AREAS.map((area, index) => {
          const Icon = ICONS[area.id];
          const to = rootDestinationForIndex(index, signedIn)!;
          const active = activeArea === area.id;
          const visuallyActive = index === visualActiveIndex;
          const badge =
            area.id === "participate"
              ? participateBadge
              : area.id === "me"
                ? meBadge
                : 0;

          return (
            <Link
              key={area.id}
              to={to as any}
              data-app-tab-index={index}
              aria-current={active ? "page" : undefined}
              aria-label={area.label}
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
                expandTabBar();
                if (wasCollapsed && active) {
                  event.preventDefault();
                  return;
                }

                event.preventDefault();
                trackPublicUxEvent("public_nav_clicked", {
                  target: active ? pathname : appEntryHref(getAppTabDestination(area.id, signedIn)),
                  metadata: {
                    area: area.id,
                    source: active ? "app_tabbar_active" : "app_tabbar_restore",
                  },
                });

                if (active) {
                  activateCurrentTab(index);
                } else {
                  openTab(index);
                }
              }}
              className={cn("solaris-app-tab", visuallyActive && "is-active")}
            >
              <span className="relative">
                <Icon className="solaris-app-tab-icon size-[1.15rem]" aria-hidden="true" />
                {badge > 0 ? (
                  <span
                    className="solaris-app-tab-badge"
                    aria-label={`${badge} item${badge === 1 ? "" : "s"} need attention`}
                  >
                    {badge > 9 ? "9+" : badge}
                  </span>
                ) : null}
              </span>
              <span className="solaris-app-tab-label">{area.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
