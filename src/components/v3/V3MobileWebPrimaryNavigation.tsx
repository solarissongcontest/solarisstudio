import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";

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
}: {
  destinations: readonly WebDestination[];
  activeArea: V3Area;
  participateAttentionCount: number;
}) {
  return (
    <nav
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
            aria-current={active ? "page" : undefined}
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
