import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  Compass,
  Home,
  Trophy,
  UserRound,
  Vote,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { PublicCommandPalette } from "@/components/public/PublicCommandPalette";
import { useAppAttentionSummary } from "@/lib/app-attention";
import { publicAreaForPath } from "@/lib/public-navigation";
import { cn } from "@/lib/utils";
import { useV3RolloutProbe } from "@/lib/v3-primary-runtime";
import { V3FoundationShell, V3TopContext } from "./V3Foundation";

type V3Area = "home" | "explore" | "participate" | "results" | "me";

type V3ShellDestination = {
  id: V3Area;
  label: string;
  to: string;
  icon: LucideIcon;
  emphasis?: boolean;
};

const V3_SHELL_DESTINATIONS: readonly V3ShellDestination[] = [
  { id: "home", label: "Home", to: "/", icon: Home },
  { id: "explore", label: "Explore", to: "/explore", icon: Compass },
  { id: "participate", label: "Participate", to: "/participate", icon: Vote, emphasis: true },
  { id: "results", label: "Results", to: "/results", icon: Trophy },
  // Me intentionally points at the current canonical personal route during
  // migration. The visible MySolaris concept can be decomposed without
  // breaking saved links or inventing a second account surface.
  { id: "me", label: "Me", to: "/my-solaris", icon: UserRound },
];

export type V3AppShellProps = {
  children: ReactNode;
  editionLabel: string;
  phaseLabel?: string | null;
  participateAttentionCount?: number;
  activeArea?: V3Area;
  topActions?: ReactNode;
  className?: string;
};

/**
 * Migration-ready V3 chrome.
 *
 * This component deliberately routes to existing canonical Solaris
 * destinations. It can therefore be rolled out independently from page
 * migrations and does not require duplicate routes, duplicate state or a
 * simultaneous rewrite of Home/Explore/Participate/Results/Me.
 *
 * Notifications and Search are also server-gated. Search reuses the existing
 * installed-app PublicCommandPalette so V3 cannot acquire a second query index,
 * recents store or search-return model. The browser can display local attention
 * hints, but it cannot enable either server-gated destination/capability.
 */
export function V3AppShell({
  children,
  editionLabel,
  phaseLabel,
  participateAttentionCount = 0,
  activeArea,
  topActions,
  className,
}: V3AppShellProps) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const publicArea = activeArea ?? publicAreaForPath(pathname);
  const attention = useAppAttentionSummary();
  const rollout = useV3RolloutProbe(true);
  const notificationsAvailable =
    rollout.data?.notificationsEnabled === true && Boolean(rollout.data.userId);
  const searchAvailable = rollout.data?.searchEnabled === true;

  const shellActions = notificationsAvailable || searchAvailable || topActions ? (
    <>
      {searchAvailable ? (
        <div data-v3-search-entry="" data-v3-search-owner="canonical">
          <PublicCommandPalette compact />
        </div>
      ) : null}
      {notificationsAvailable ? (
        <Link
          to={"/notifications" as any}
          className="v3-icon-button"
          aria-label="Notifications"
          title="Notifications"
          data-v3-notifications-entry=""
        >
          <span className="relative grid place-items-center" aria-hidden="true">
            <Bell className="size-[18px]" />
            {attention.me > 0 ? (
              <span className="absolute -right-2 -top-2 grid min-h-4 min-w-4 place-items-center rounded-full bg-[var(--v3-danger)] px-1 text-[0.58rem] font-extrabold leading-none text-white shadow-[0_0_0_2px_var(--v3-bg-base)]">
                {attention.me > 9 ? "9+" : attention.me}
              </span>
            ) : null}
          </span>
        </Link>
      ) : null}
      {topActions}
    </>
  ) : undefined;

  return (
    <V3FoundationShell>
      <div className={cn("min-h-dvh", className)}>
        <V3TopContext edition={editionLabel} phase={phaseLabel} actions={shellActions} />
        {children}
      </div>

      <nav className="v3-bottom-nav" aria-label="Primary app navigation">
        {V3_SHELL_DESTINATIONS.map(({ id, label, to, icon: Icon, emphasis }) => {
          const active = publicArea === id;
          const attentionCount = id === "participate" ? participateAttentionCount : 0;

          return (
            <Link
              key={id}
              to={to as any}
              className="v3-bottom-nav__item"
              aria-current={active ? "page" : undefined}
              data-emphasis={emphasis ? "true" : undefined}
              data-active={active ? "true" : undefined}
            >
              <span className="relative grid place-items-center" aria-hidden="true">
                <Icon className="size-[19px]" strokeWidth={active ? 2.3 : 1.9} />
                {attentionCount > 0 ? (
                  <span className="absolute -right-2 -top-2 grid min-h-4 min-w-4 place-items-center rounded-full bg-[var(--v3-danger)] px-1 text-[0.58rem] font-extrabold leading-none text-white shadow-[0_0_0_2px_var(--v3-bg-base)]">
                    {attentionCount > 9 ? "9+" : attentionCount}
                  </span>
                ) : null}
              </span>
              <span className="v3-bottom-nav__label">{label}</span>
            </Link>
          );
        })}
      </nav>
    </V3FoundationShell>
  );
}

export { V3_SHELL_DESTINATIONS };
