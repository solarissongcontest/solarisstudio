import { Link, useNavigate } from "@tanstack/react-router";
import { Compass, Home, Trophy, UserRound, Vote, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

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

function destinationForIndex(index: number, signedIn: boolean) {
  const area = PUBLIC_GLOBAL_AREAS[index];
  if (!area) return null;
  return area.id === "me" ? (signedIn ? "/my-solaris" : "/auth") : area.to;
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
  }, []);

  const activeArea: PrimaryArea =
    routeArea === "help" ? fallbackArea : isPrimaryArea(routeArea) ? routeArea : fallbackArea;
  const activeIndex = Math.max(
    0,
    PUBLIC_GLOBAL_AREAS.findIndex((area) => area.id === activeArea),
  );
  const visualActiveIndex = dragPreviewIndex ?? activeIndex;

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
    if (!active || collapsed || event.pointerType === "mouse" && event.button !== 0) return;

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
    const to = destinationForIndex(targetIndex, signedIn);
    const area = PUBLIC_GLOBAL_AREAS[targetIndex];
    if (!to || !area) return;

    trackPublicUxEvent("public_nav_clicked", {
      target: to,
      metadata: { area: area.id, source: "app_tabbar_drag" },
    });
    void navigate({ to: to as any });
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
      onPointerDown={() => {
        if (collapsed) setCollapsed(false);
      }}
    >
      <svg
        className="solaris-liquid-glass-filter"
        width="0"
        height="0"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <filter
            id="solaris-liquid-glass-refraction"
            x="-8%"
            y="-18%"
            width="116%"
            height="136%"
            colorInterpolationFilters="sRGB"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.012 0.085"
              numOctaves="2"
              seed="11"
              result="liquid-noise"
            />
            <feGaussianBlur
              in="liquid-noise"
              stdDeviation="0.45"
              result="liquid-noise-soft"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="liquid-noise-soft"
              scale="5.5"
              xChannelSelector="R"
              yChannelSelector="G"
              result="liquid-refraction"
            />
            <feColorMatrix
              in="liquid-refraction"
              type="saturate"
              values="1.08"
            />
          </filter>
        </defs>
      </svg>

      <div
        ref={materialRef}
        className="solaris-app-tabbar-material"
        data-active-index={activeIndex}
        data-dragging={dragging ? "true" : "false"}
      >
        <span className="solaris-app-tab-indicator" aria-hidden="true" />

        {PUBLIC_GLOBAL_AREAS.map((area, index) => {
          const Icon = ICONS[area.id];
          const to = destinationForIndex(index, signedIn)!;
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
                trackPublicUxEvent("public_nav_clicked", {
                  target: to,
                  metadata: { area: area.id, source: "app_tabbar" },
                });
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
