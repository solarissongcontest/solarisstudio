import { Link } from "@tanstack/react-router";

import { resolveV3WebNavigationCurrent } from "@/lib/v3-web-current-link";
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
  pathname,
}: {
  destinations: readonly V3LiquidTabDestination[];
  onSelect: (destination: V3LiquidTabDestination) => void;
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
            onClick={(event) => {
              // Preserve the browser's modified click, new-tab, keyboard and
              // user-agent navigation behavior. Only ordinary primary clicks
              // use the existing V3 per-tab restoration contract.
              if (
                event.defaultPrevented ||
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              ) return;
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
