import { Link } from "@tanstack/react-router";

import { resolveV3WebNavigationCurrent } from "@/lib/v3-web-current-link";
import type { V3LiquidTabDestination } from "./V3LiquidTabBar";
import "@/styles/v3-responsive-shell.css";

function navigationItemLabel(label: string, badge: number) {
  if (badge <= 0) return label;
  return `${label}, ${badge} item${badge === 1 ? "" : "s"}`;
}

/** Native desktop website navigation. The browser owns URL and history,
 * never the installed app's per-tab restoration state. */
export function V3DesktopPrimaryNavigation({
  destinations,
  pathname,
}: {
  destinations: readonly V3LiquidTabDestination[];
  pathname: string;
}) {
  return (
    <nav className="v3-desktop-primary-nav" aria-label="Solaris website sections">
      {destinations.map((destination) => {
        const Icon = destination.icon;
        const badge = destination.badge ?? 0;
        return (
          <Link
            key={destination.id}
            to={destination.to as any}
            className="v3-desktop-primary-nav__item"
            aria-current={resolveV3WebNavigationCurrent({ active: destination.active, pathname, target: destination.to })}
            aria-label={navigationItemLabel(destination.label, badge)}
            data-active={destination.active ? "true" : "false"}
            data-emphasis={destination.emphasis ? "true" : undefined}
          >
            <span className="v3-desktop-primary-nav__icon" aria-hidden="true">
              <Icon />
              {badge > 0 ? (
                <span className="v3-desktop-primary-nav__badge">
                  {badge > 99 ? "99+" : badge}
                </span>
              ) : null}
            </span>
            <span>{destination.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
