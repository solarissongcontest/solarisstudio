import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  BookOpen,
  Compass,
  Home,
  Trophy,
  UserRound,
  Vote,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import { PublicCommandPalette } from "@/components/public/PublicCommandPalette";
import { useAppAttentionSummary } from "@/lib/app-attention";
import { resolveV3ShellActiveArea } from "@/lib/v3-shell-active-area";
import { getRuleContext, sanitizeRuleContextPath } from "@/lib/rule-context";
import { cn } from "@/lib/utils";
import { useV3RolloutProbe } from "@/lib/v3-primary-runtime";
import { V3DesktopPrimaryNavigation } from "./V3DesktopPrimaryNavigation";
import { V3FoundationShell, V3TopContext } from "./V3Foundation";
import {
  V3LiquidTabBar,
  type V3LiquidTabDestination,
} from "./V3LiquidTabBar";

export type V3Area = "home" | "explore" | "participate" | "results" | "me";

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

const ACTIVE_NAV_STYLE: CSSProperties = {
  color: "var(--v3-text-primary)",
  background: "rgba(206, 235, 249, 0.10)",
  boxShadow: "inset 0 1px 0 rgba(245,252,255,0.10)",
};

export type V3BottomNavigationProps = {
  activeArea: V3Area | null;
  participateAttentionCount?: number;
};

/**
 * Static five-destination preview navigation retained for the TerraOS maintenance
 * teaser. Installed V3 uses V3LiquidTabBar below; keeping this preview helper
 * avoids coupling the maintenance teaser to gesture/runtime state.
 */
export function V3BottomNavigation({
  activeArea,
  participateAttentionCount = 0,
}: V3BottomNavigationProps) {
  return (
    <nav className="v3-bottom-nav" aria-label="Primary app navigation">
      {V3_SHELL_DESTINATIONS.map(({ id, label, to, icon: Icon, emphasis }) => {
        const active = activeArea === id;
        const attentionCount = id === "participate" ? participateAttentionCount : 0;

        return (
          <Link
            key={id}
            to={to as any}
            className="v3-bottom-nav__item"
            aria-current={active ? "page" : undefined}
            data-emphasis={emphasis ? "true" : undefined}
            data-active={active ? "true" : undefined}
            style={active ? ACTIVE_NAV_STYLE : undefined}
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
  );
}

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
 * Canonical route ownership stays in TanStack Router and the screen registry.
 * The Liquid bar provides direct manipulation as progressive enhancement, but
 * every destination remains a semantic link and this shell never invents a
 * second URL/state model. Whole-page swipe is deliberately not enabled here;
 * that remains fail-closed until route owners provide safe live adjacent DOM
 * surfaces rather than screenshots or duplicate data graphs.
 *
 * Notifications, Search and Rules guidance are server-gated. Search reuses the
 * existing installed-app PublicCommandPalette. Rules guidance links into the
 * existing versioned Rules domain and its coarse workflow contexts, so V3 does
 * not acquire another query index, rule corpus, recents store or guidance state
 * model. Browser-local state cannot enable these capabilities.
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
  const searchStr = useRouterState({ select: (state) => state.location.searchStr });
  const navigate = useNavigate();
  const publicArea = activeArea ?? resolveV3ShellActiveArea(pathname, searchStr);
  const attention = useAppAttentionSummary();
  const rollout = useV3RolloutProbe(true);
  const notificationsAvailable =
    rollout.data?.notificationsEnabled === true && Boolean(rollout.data.userId);
  const searchAvailable = rollout.data?.searchEnabled === true;
  const rulesGuidanceAvailable = rollout.data?.rulesGuidanceEnabled === true;
  const ruleContext = rulesGuidanceAvailable ? getRuleContext(pathname) : null;
  const ruleContextPath = sanitizeRuleContextPath(ruleContext?.sourcePath);

  const navigationDestinations: V3LiquidTabDestination[] = V3_SHELL_DESTINATIONS.map(
    ({ id, label, to, icon, emphasis }) => ({
      id,
      label,
      to,
      icon,
      emphasis,
      active: publicArea === id,
      badge: id === "participate" ? participateAttentionCount : 0,
    }),
  );

  const selectDestination = (destination: V3LiquidTabDestination) => {
    void navigate({ to: destination.to as any });
  };

  const shellActions =
    notificationsAvailable || searchAvailable || rulesGuidanceAvailable || topActions ? (
      <>
        {searchAvailable ? (
          <div data-v3-search-entry="" data-v3-search-owner="canonical">
            <PublicCommandPalette compact />
          </div>
        ) : null}
        {rulesGuidanceAvailable ? (
          <Link
            to={(ruleContextPath ? "/rules/applied" : "/rules") as any}
            search={ruleContextPath ? ({ context: ruleContextPath } as any) : undefined}
            className="v3-icon-button"
            aria-label={ruleContextPath ? "Rules for this task" : "Rules"}
            title={ruleContextPath ? "Rules for this task" : "Rules"}
            data-v3-rules-guidance-entry=""
            data-v3-rules-guidance-context={ruleContext?.key}
          >
            <BookOpen className="size-[18px]" aria-hidden="true" />
          </Link>
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
        <V3DesktopPrimaryNavigation
          destinations={navigationDestinations}
          onSelect={selectDestination}
        />
        {children}
      </div>

      <V3LiquidTabBar
        pathname={pathname}
        destinations={navigationDestinations}
        onSelect={selectDestination}
      />
    </V3FoundationShell>
  );
}

export { V3_SHELL_DESTINATIONS };
