import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import type { LucideIcon } from "lucide-react";

import { resolveV3WebNavigationCurrent } from "@/lib/v3-web-current-link";
import type { V3Area } from "./V3AppShell";
import "@/styles/v3-mobile-web-primary-nav.css";

type WebDestination = {
  id: V3Area;
  label: string;
  to: string;
  icon: LucideIcon;
  emphasis?: boolean;
};

/**
 * Browser-native mobile sections. Only canonical root links are offered, not
 * app tab-memory destinations; the browser owns Back/Forward and deep links.
 */
export function V3MobileWebPrimaryNavigation({
  destinations,
  activeArea,
  participateAttentionCount,
  pathname,
}: {
  destinations: readonly WebDestination[];
  activeArea: V3Area | null;
  participateAttentionCount: number;
  pathname: string;
}) {
  const navRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    // Five readable sections may overflow on narrow mobile websites. Reveal
    // the current section without scrolling the document vertically or taking
    // over the browser's URL/history behavior. Physical rectangles also work
    // with RTL and font scaling.
    const keepActiveVisible = () => {
      const active = nav.querySelector<HTMLElement>('[aria-current]');
      if (!active) return;
      const viewport = nav.getBoundingClientRect();
      const item = active.getBoundingClientRect();
      const delta = item.left < viewport.left
        ? item.left - viewport.left
        : item.right > viewport.right
          ? item.right - viewport.right
          : 0;
      if (Math.abs(delta) > 1) nav.scrollLeft += delta;
    };

    keepActiveVisible();
    window.addEventListener("resize", keepActiveVisible);
    return () => window.removeEventListener("resize", keepActiveVisible);
  }, [activeArea]);

  return (
    <nav
      ref={navRef}
      className="v3-mobile-web-primary-nav"
      aria-label="Solaris website sections"
      data-v3-web-section-navigation=""
    >
      {destinations.map((destination) => {
        const active = activeArea === destination.id;
        const badge = destination.id === "participate" ? participateAttentionCount : 0;
        return (
          <Link
            key={destination.id}
            to={destination.to as any}
            className="v3-mobile-web-primary-nav__item"
            data-active={active ? "true" : "false"}
            aria-current={resolveV3WebNavigationCurrent({ active, pathname, target: destination.to })}
            aria-label={
              badge > 0
                ? destination.label + ", " + badge + (badge === 1 ? " item" : " items") + " need attention"
                : destination.label
            }
          >
            <span>{destination.label}</span>
            {badge > 0 ? (
              <span className="v3-mobile-web-primary-nav__badge" aria-hidden="true">
                {badge > 99 ? "99+" : badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
