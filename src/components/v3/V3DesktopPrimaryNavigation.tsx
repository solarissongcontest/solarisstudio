import { Link } from "@tanstack/react-router";

import type { V3LiquidTabDestination } from "./V3LiquidTabBar";
import "@/styles/v3-responsive-shell.css";

function navigationItemLabel(label: string, badge: number) {
  if (badge <= 0) return label;
  return `${label}, ${badge} item${badge === 1 ? "" : "s"}`;
}

/** Desktop adaptation of the same canonical five-area information architecture. */
export function V3DesktopPrimaryNavigation({
  destinations,
  onSelect,
}: {
  destinations: readonly V3LiquidTabDestination[];
  onSelect: (destination: V3LiquidTabDestination) => void;
}) {
  return (
    <nav className="v3-desktop-primary-nav" aria-label="Primary app navigation">
      {destinations.map((destination) => {
        const Icon = destination.icon;
        const badge = destination.badge ?? 0;
        return (
          <Link
            key={destination.id}
            to={destination.to as any}
            className="v3-desktop-primary-nav__item"
            aria-current={destination.active ? "page" : undefined}
            aria-label={navigationItemLabel(destination.label, badge)}
            data-active={destination.active ? "true" : "false"}
            data-emphasis={destination.emphasis ? "true" : undefined}
            onClick={(event) => {
              event.preventDefault();
              onSelect(destination);
            }}
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
