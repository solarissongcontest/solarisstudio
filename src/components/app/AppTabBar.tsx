import { Link } from "@tanstack/react-router";
import { Compass, Home, Trophy, UserRound, Vote, type LucideIcon } from "lucide-react";

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
  const activeArea = publicAreaForPath(pathname);

  return (
    <nav className="solaris-app-tabbar" aria-label="Solaris Studio">
      <div className="solaris-app-tabbar-material">
        {PUBLIC_GLOBAL_AREAS.map((area) => {
          const Icon = ICONS[area.id];
          const to = area.id === "me" ? (signedIn ? "/my-solaris" : "/auth") : area.to;
          const active =
            area.id === "me"
              ? pathname.startsWith("/my-solaris") ||
                pathname.startsWith("/me") ||
                pathname.startsWith("/auth")
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
              onClick={() =>
                trackPublicUxEvent("public_nav_clicked", {
                  target: to,
                  metadata: { area: area.id, source: "app_tabbar" },
                })
              }
              className={cn("solaris-app-tab", active && "is-active")}
            >
              <span className="relative">
                <Icon className="size-[1.15rem]" aria-hidden="true" />
                {badge > 0 ? (
                  <span
                    className="solaris-app-tab-badge"
                    aria-label={`${badge} item${badge === 1 ? "" : "s"} need attention`}
                  >
                    {badge > 9 ? "9+" : badge}
                  </span>
                ) : null}
              </span>
              <span>{area.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
