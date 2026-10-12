import { Link, useRouterState } from "@tanstack/react-router";
import {
  Compass,
  Home,
  Trophy,
  UserRound,
  Vote,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { publicAreaForPath } from "@/lib/public-navigation";
import { cn } from "@/lib/utils";
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
 */
export function V3AppShell({
  children,
  editionLabel,
  phaseLabel,
  participateAttentionCount = 0,
  topActions,
  className,
}: V3AppShellProps) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const publicArea = publicAreaForPath(pathname);

  return (
    <V3FoundationShell>
      <div className={cn("min-h-dvh", className)}>
        <V3TopContext edition={editionLabel} phase={phaseLabel} actions={topActions} />
        {children}
      </div>

      <nav className="v3-bottom-nav" aria-label="Primary app navigation">
        {V3_SHELL_DESTINATIONS.map(({ id, label, to, icon: Icon, emphasis }) => {
          const active = publicArea === id;
          const attention = id === "participate" ? participateAttentionCount : 0;

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
                {attention > 0 ? (
                  <span className="absolute -right-2 -top-2 grid min-h-4 min-w-4 place-items-center rounded-full bg-[var(--v3-danger)] px-1 text-[0.58rem] font-extrabold leading-none text-white shadow-[0_0_0_2px_var(--v3-bg-base)]">
                    {attention > 9 ? "9+" : attention}
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
