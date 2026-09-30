import { Link, useNavigate } from "@tanstack/react-router";
import { Compass, Home, Trophy, UserRound, Vote, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { KubeLiquidGlassBackdrop } from "@/components/app/KubeLiquidGlassBackdrop";
import {
  appEntryHref,
  appTabRoot,
  getAppTabDestination,
  markAppNavigationRestore,
  resetAppTabToRoot,
} from "@/lib/app-navigation";
import { runAppViewTransition } from "@/lib/app-view-transitions";
import { PUBLIC_GLOBAL_AREAS, publicAreaForPath } from "@/lib/public-navigation";
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

const LAST_PRIMARY_AREA_KEY = "solaris:app-last-primary-area";

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
  signedIn,
  participateBadge = 0,
  meBadge = 0,
}: {
  pathname: string;
  signedIn: boolean;
  participateBadge?: number;
  meBadge?: number;
}) {
  const navigate = useNavigate();
  const routeArea = publicAreaForPath(pathname);
  const [collapsed, setCollapsed] = useState(false);
  const [railMode, setRailMode] = useState(false);
  const [fallbackArea, setFallbackArea] = useState<PrimaryArea>("home");
  const [dragPreviewIndex, setDragPreviewIndex] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const lastScrollY = useRef(0);
  const downTravel = useRef(0);
  const upTravel = useRef(0);
  const frame = useRef<number | null>(null);
  const materialRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<DragState | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 900px)");
    const refresh = () => {
      setRailMode(media.matches);
      if (media.matches) setCollapsed(false);
    };
    refresh();
    media.addEventListener?.("change", refresh);
    return () => media.removeEventListener?.("change", refresh);
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem(LAST_PRIMARY_AREA_KEY);
    if (stored && isPrimaryArea(stored)) setFallbackArea(stored);
  }, []);

  useEffect(() => {
    if (routeArea !== "help" && isPrimaryArea(routeArea)) {
      setFallbackArea(routeArea);
      window.localStorage.setItem(LAST_PRIMARY_AREA_KEY, routeArea);
    }
    setCollapsed(false);
    lastScrollY.current = window.scrollY;
    downTravel.current = 0;
    upTravel.current = 0;
  }, [pathname, routeArea]);

  useEffect(() => {
    lastScrollY.current = window.scrollY;
    if (railMode) {
      setCollapsed(false);
      return;
    }

    const evaluate = () => {
      frame.current = null;
      const current = Math.max(0, window.scrollY);
      const delta = current - lastScrollY.current;

      if (current < 80) {
        setCollapsed(false);
        downTravel.current = 0;
        upTravel.current = 0;
      } else if (delta > 0) {
        downTravel.current += delta;
        upTravel.current = 0;
        if (current > 140 && downTravel.current >= 56) {
          setCollapsed(true);
          downTravel.current = 0;
        }
      } else if (delta < 0) {
        upTravel.current += -delta;
        downTravel.current = 0;
        if (upTravel.current >= 18) {
          setCollapsed(false);
          upTravel.current = 0;
        }
      }

      lastScrollY.current = current;
    };

    const onScroll = () => {
      if (frame.current != null) return;
      frame.current = window.requestAnimationFrame(evaluate);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame.current != null) window.cancelAnimationFrame(frame.current);
    };
  }, [railMode]);

  const activeArea: PrimaryArea =
    routeArea === "help" ? fallbackArea : isPrimaryArea(routeArea) ? routeArea : fallbackArea;
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

    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
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

  const clearDrag = () => {
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
  };

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
    const rawDelta = event.clientX - drag.startX;
    const delta = Math.min(maxCenter - originCenter, Math.max(minCenter - originCenter, rawDelta));
    const distance = Math.abs(delta);
    const slotWidth = Math.max(1, origin.width);
    const pullProgress = Math.min(1, distance / Math.max(1, slotWidth * 1.15));
    const indicatorStretch = 1 + pullProgress * 0.055;
    const barGrowWidth = pullProgress * 10;
    const barGrowHeight = pullProgress * 9;
    const barGrowRadius = pullProgress * 4;

    if (distance >= 7) drag.moved = true;
    const material = materialRef.current;
    material?.style.setProperty("--solaris-tab-drag-x", `${delta}px`);
    material?.style.setProperty("--solaris-tab-drag-scale-x", indicatorStretch.toFixed(4));
    material?.style.setProperty("--solaris-tabbar-pull-width", `${barGrowWidth.toFixed(2)}px`);
    material?.style.setProperty("--solaris-tabbar-pull-height", `${barGrowHeight.toFixed(2)}px`);
    material?.style.setProperty("--solaris-tabbar-pull-radius", `${barGrowRadius.toFixed(2)}px`);
    material?.setAttribute(
      "data-drag-direction",
      delta > 2 ? "right" : delta < -2 ? "left" : "center",
    );

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

  return (
    <nav
      className={cn("solaris-app-tabbar", collapsed && "is-collapsed")}
      aria-label="Solaris Studio"
      data-collapsed={collapsed ? "true" : "false"}
      data-layout={railMode ? "rail" : "bar"}
      onPointerDown={() => {
        if (collapsed) setCollapsed(false);
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
          const active =
            area.id === "me"
              ? pathname.startsWith("/my-solaris") ||
                pathname.startsWith("/me") ||
                pathname.startsWith("/auth") ||
                (routeArea === "help" && activeArea === "me")
              : activeArea === area.id;
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
              onClick={(event) => {
                if (suppressClick.current) {
                  suppressClick.current = false;
                  event.preventDefault();
                  return;
                }

                const wasCollapsed = collapsed;
                setCollapsed(false);
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
