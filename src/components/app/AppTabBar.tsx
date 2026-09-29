import { Link } from "@tanstack/react-router";
import { Compass, Home, Trophy, UserRound, Vote, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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

const LAST_PRIMARY_AREA_KEY = "solaris:app-last-primary-area";

function isPrimaryArea(value: string): value is PrimaryArea {
  return PUBLIC_GLOBAL_AREAS.some((area) => area.id === value);
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
  const routeArea = publicAreaForPath(pathname);
  const [collapsed, setCollapsed] = useState(false);
  const [fallbackArea, setFallbackArea] = useState<PrimaryArea>("home");
  const lastScrollY = useRef(0);
  const downTravel = useRef(0);
  const upTravel = useRef(0);
  const frame = useRef<number | null>(null);

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

  return (
    <nav
      className={cn("solaris-app-tabbar", collapsed && "is-collapsed")}
      aria-label="Solaris Studio"
      data-collapsed={collapsed ? "true" : "false"}
      onPointerDown={() => {
        if (collapsed) setCollapsed(false);
      }}
    >
      <div className="solaris-app-tabbar-material">
        {PUBLIC_GLOBAL_AREAS.map((area) => {
          const Icon = ICONS[area.id];
          const to = area.id === "me" ? (signedIn ? "/my-solaris" : "/auth") : area.to;
          const active =
            area.id === "me"
              ? pathname.startsWith("/my-solaris") ||
                pathname.startsWith("/me") ||
                pathname.startsWith("/auth") ||
                (routeArea === "help" && activeArea === "me")
              : activeArea === area.id;
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
              aria-current={active ? "page" : undefined}
              aria-label={area.label}
              onClick={() => {
                setCollapsed(false);
                trackPublicUxEvent("public_nav_clicked", {
                  target: to,
                  metadata: { area: area.id, source: "app_tabbar" },
                });
              }}
              className={cn("solaris-app-tab", active && "is-active")}
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
