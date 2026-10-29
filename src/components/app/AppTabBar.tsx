import { Link, useNavigate } from "@tanstack/react-router";
import { Compass, Home, Trophy, UserRound, Vote, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { KubeLiquidGlassBackdrop } from "@/components/app/KubeLiquidGlassBackdrop";
import { APP_RESUME_EVENT } from "@/lib/app-lifecycle";
import {
  appEntryHref,
  appTabRoot,
  getAppTabDestination,
  markAppNavigationRestore,
  resetAppTabToRoot,
} from "@/lib/app-navigation";
import { resolveAppRouteChrome } from "@/lib/app-route-chrome";
import {
  clearAppUpdateBlocker,
  setAppUpdateBlocker,
} from "@/lib/app-update-safety";
import { runAppViewTransition } from "@/lib/app-view-transitions";
import {
  prefersReducedMotion,
  resolveElasticDrag,
  resolveTabDragTargetIndex,
} from "@/lib/interaction-physics";
import { PUBLIC_GLOBAL_AREAS } from "@/lib/public-navigation";
import { trackPublicUxEvent } from "@/lib/public-ux-events";
import { useScrollResponsiveBar } from "@/lib/use-scroll-responsive-bar";
import { useSolarisPressHold } from "@/lib/use-solaris-press-hold";
import { cn } from "@/lib/utils";

const APP_TABBAR_GESTURE_UPDATE_BLOCKER = "app-tabbar-gesture";

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
  captureTarget: HTMLAnchorElement;
  startX: number;
  originIndex: number;
  moved: boolean;
  lastX: number;
  lastAt: number;
  velocityX: number;
  minDelta: number;
  maxDelta: number;
  slotWidth: number;
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
  const {
    held,
    begin: beginHold,
    move: moveHold,
    end: endHold,
  } = useSolarisPressHold();

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

  // Publish the obstruction before paint. A normal effect used to reset the
  // shared CSS variable to 0 during every collapsed/path dependency cleanup,
  // creating a one-frame loss of reserved scroll space. On narrow screens that
  // was enough to leave the final content underneath the floating bar.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const bar = barRef.current;

    const updateMetrics = () => {
      if (
        !bar ||
        railMode ||
        tabbarMode === "hidden" ||
        root.hasAttribute("data-solaris-keyboard-open")
      ) {
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
    const rootObserver =
      typeof MutationObserver !== "undefined" ? new MutationObserver(updateMetrics) : null;
    rootObserver?.observe(root, {
      attributes: true,
      attributeFilter: ["data-solaris-keyboard-open"],
    });
    window.addEventListener("resize", updateMetrics);
    window.visualViewport?.addEventListener("resize", updateMetrics);

    return () => {
      observer?.disconnect();
      rootObserver?.disconnect();
      window.removeEventListener("resize", updateMetrics);
      window.visualViewport?.removeEventListener("resize", updateMetrics);
      // Do not zero the obstruction here. Dependency changes immediately
      // install the next measurement and clearing in between causes geometry
      // flicker. True unmount cleanup below owns the reset.
    };
  }, [collapsed, railMode, tabbarMode, pathname]);

  useEffect(
    () => () => {
      // Route-level shells can be replaced in one React commit. Passive cleanup
      // for the old AppTabBar runs after the replacement's layout effect has
      // already published its measurement, so blindly clearing here can erase
      // the new bar's obstruction and collapse the shell spacer underneath it.
      // Only the final tab-bar owner is allowed to clear the shared metrics.
      if (document.querySelector(".solaris-app-tabbar")) return;

      const root = document.documentElement;
      root.style.setProperty("--solaris-app-bottom-obstruction", "0px");
      root.style.setProperty("--solaris-bottom-obstruction", "0px");
    },
    [],
  );

  const activeArea: PrimaryArea = routeArea;
  const activeIndex = Math.max(
    0,
    PUBLIC_GLOBAL_AREAS.findIndex((area) => area.id === activeArea),
  );
  const visualActiveIndex = dragging ? activeIndex : dragPreviewIndex ?? activeIndex;

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

  const resetDragDom = useCallback(() => {
    clearAppUpdateBlocker(APP_TABBAR_GESTURE_UPDATE_BLOCKER);
    const drag = dragState.current;
    if (drag) {
      try {
        if (drag.captureTarget.hasPointerCapture?.(drag.pointerId)) {
          drag.captureTarget.releasePointerCapture?.(drag.pointerId);
        }
      } catch {
        // Browser may already have released pointer capture.
      }
    }

    const material = materialRef.current;
    material?.style.setProperty("--solaris-tab-drag-x", "0px");
    material?.style.setProperty("--solaris-tab-drag-scale-x", "1");
    material?.style.setProperty("--solaris-tabbar-pull-width", "0px");
    material?.style.setProperty("--solaris-tabbar-pull-height", "0px");
    material?.style.setProperty("--solaris-tabbar-pull-radius", "0px");
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
      // Unmount/StrictMode teardown must not set React state. The press-hold
      // hook cancels its own timer; only imperative DOM/ref cleanup is needed.
      resetDragDom();
    };
  }, [clearDrag, pathname, resetDragDom, searchStr]);

  const startDrag = (
    event: ReactPointerEvent<HTMLAnchorElement>,
    index: number,
    active: boolean,
  ) => {
    const root = document.documentElement;
    if (
      !active ||
      collapsed ||
      railMode ||
      prefersReducedMotion() ||
      root.hasAttribute("data-solaris-keyboard-open") ||
      root.hasAttribute("data-solaris-feature-overlay-open") ||
      (event.pointerType === "mouse" && event.button !== 0)
    ) return;

    const rects = tabRects();
    const origin = rects[index];
    if (!origin) return;
    const first = rects[0] ?? origin;
    const last = rects.at(-1) ?? origin;
    const originCenter = origin.left + origin.width / 2;

    dragState.current = {
      pointerId: event.pointerId,
      captureTarget: event.currentTarget,
      startX: event.clientX,
      originIndex: index,
      moved: false,
      lastX: event.clientX,
      lastAt: event.timeStamp,
      velocityX: 0,
      minDelta: first.left + first.width / 2 - originCenter,
      maxDelta: last.left + last.width / 2 - originCenter,
      slotWidth: origin.width,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setAppUpdateBlocker(
      APP_TABBAR_GESTURE_UPDATE_BLOCKER,
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
    material?.style.setProperty("--solaris-tab-drag-x", `${response.delta}px`);
    material?.style.setProperty("--solaris-tab-drag-scale-x", response.scaleX.toFixed(4));
    material?.style.setProperty("--solaris-tabbar-pull-width", `${response.growWidth.toFixed(2)}px`);
    material?.style.setProperty("--solaris-tabbar-pull-height", `${response.growHeight.toFixed(2)}px`);
    material?.style.setProperty("--solaris-tabbar-pull-radius", `${response.growRadius.toFixed(2)}px`);
    material?.setAttribute("data-drag-direction", response.direction);

    const preview = resolveTabDragTargetIndex({
      rawDelta,
      originIndex: drag.originIndex,
      slotWidth: drag.slotWidth,
      itemCount: PUBLIC_GLOBAL_AREAS.length,
      activationRatio: 0.62,
      maxSteps: 1,
    });
    setDragPreviewIndex((current) => (current === preview ? current : preview));

    if (drag.moved) event.preventDefault();
  };

  const finishDrag = (event: ReactPointerEvent<HTMLAnchorElement>) => {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const targetIndex = resolveTabDragTargetIndex({
      rawDelta: event.clientX - drag.startX,
      velocityX: drag.velocityX,
      velocityProjectionMs: 110,
      originIndex: drag.originIndex,
      slotWidth: drag.slotWidth,
      itemCount: PUBLIC_GLOBAL_AREAS.length,
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

    clearDrag();

    if (longPressed || !moved || targetIndex === drag.originIndex) return;
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
    suppressClick.current = drag.moved || held;
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
        data-held={held ? "true" : "false"}
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
