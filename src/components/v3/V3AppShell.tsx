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
import { useEffect, type ReactNode } from "react";

import { PublicCommandPalette } from "@/components/public/PublicCommandPalette";
import { useAppAttentionSummary } from "@/lib/app-attention";
import { runAppViewTransition } from "@/lib/app-view-transitions";
import { prefersReducedMotion } from "@/lib/interaction-physics";
import { resolveV3ShellActiveArea } from "@/lib/v3-shell-active-area";
import {
  consumeV3PublicNavigationRestore,
  getV3PublicTabDestination,
  markV3PublicNavigationRestore,
  rememberV3PublicLocation,
  resetV3PublicTabToRoot,
  updateV3PublicScrollPosition,
  v3PublicEntryHref,
  type V3PublicTabId,
} from "@/lib/v3-public-navigation";
import { getRuleContext, sanitizeRuleContextPath } from "@/lib/rule-context";
import { cn } from "@/lib/utils";
import { useV3RolloutProbe } from "@/lib/v3-primary-runtime";
import { V3FoundationShell, V3TopContext } from "./V3Foundation";
import {
  V3LiquidTabBar,
  type V3LiquidTabDestination,
} from "./V3LiquidTabBar";
import { V3TopLevelSwipeSurface } from "./V3TopLevelSwipeSurface";

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
 * Canonical route ownership remains in TanStack Router/app-screen-registry.
 * The floating tab bar adds direct manipulation without becoming a second
 * router. Per-tab memory is viewer-scoped and rejects focused/immersive routes.
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
  // Navigation memory is scoped to the authenticated viewer when known. An
  // anonymous/logout session therefore cannot resurrect another user's Me path.
  const navigationScope = rollout.data?.userId ?? null;

  useEffect(() => {
    if (typeof window === "undefined") return;

    const restoreY = consumeV3PublicNavigationRestore(
      pathname,
      searchStr,
      undefined,
      navigationScope,
    );
    rememberV3PublicLocation(
      pathname,
      searchStr,
      restoreY ?? undefined,
      undefined,
      navigationScope,
    );

    if (restoreY != null) {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => window.scrollTo({ top: restoreY, behavior: "auto" }));
      });
    }

    let frame: number | null = null;
    const persistScroll = () => {
      frame = null;
      updateV3PublicScrollPosition(
        pathname,
        searchStr,
        window.scrollY,
        undefined,
        navigationScope,
      );
    };
    const onScroll = () => {
      if (frame != null) return;
      frame = window.requestAnimationFrame(persistScroll);
    };
    const onPageHide = () =>
      updateV3PublicScrollPosition(
        pathname,
        searchStr,
        window.scrollY,
        undefined,
        navigationScope,
      );

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", onPageHide);
      if (frame != null) window.cancelAnimationFrame(frame);
      updateV3PublicScrollPosition(
        pathname,
        searchStr,
        window.scrollY,
        undefined,
        navigationScope,
      );
    };
  }, [navigationScope, pathname, searchStr]);

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

  const liquidDestinations: V3LiquidTabDestination[] = V3_SHELL_DESTINATIONS.map(
    (destination) => ({
      ...destination,
      active: publicArea === destination.id,
      badge: destination.id === "participate" ? participateAttentionCount : 0,
    }),
  );
  const activeIndex = Math.max(
    0,
    liquidDestinations.findIndex((destination) => destination.active),
  );

  const openTab = (
    destination: V3LiquidTabDestination,
    navigationMode: "tap" | "swipe" = "tap",
  ) => {
    const id = destination.id as V3PublicTabId;
    const alreadyActive = publicArea === id;
    const normalizedPath = pathname.endsWith("/") && pathname !== "/" ? pathname.slice(0, -1) : pathname;
    const normalizedRoot =
      destination.to.endsWith("/") && destination.to !== "/"
        ? destination.to.slice(0, -1)
        : destination.to;

    if (alreadyActive && normalizedPath === normalizedRoot) {
      window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
      return;
    }

    const target = alreadyActive
      ? resetV3PublicTabToRoot(id, undefined, navigationScope)
      : getV3PublicTabDestination(id, undefined, navigationScope);
    markV3PublicNavigationRestore(target, undefined, navigationScope);
    const navigateToTarget = () => navigate({ to: v3PublicEntryHref(target) as any });

    if (navigationMode === "swipe") {
      void navigateToTarget();
      return;
    }

    void runAppViewTransition(alreadyActive ? "pop" : "tab", navigateToTarget);
  };

  return (
    <V3FoundationShell>
      <div className={cn("min-h-dvh", className)}>
        <V3TopContext edition={editionLabel} phase={phaseLabel} actions={shellActions} />
        <V3TopLevelSwipeSurface
          pathname={pathname}
          searchStr={searchStr}
          activeIndex={activeIndex}
          itemCount={liquidDestinations.length}
          onCommit={(targetIndex) => {
            const target = liquidDestinations[targetIndex];
            if (target) openTab(target, "swipe");
          }}
        >
          {children}
        </V3TopLevelSwipeSurface>
      </div>

      <V3LiquidTabBar
        pathname={pathname}
        destinations={liquidDestinations}
        onSelect={openTab}
      />
    </V3FoundationShell>
  );
}

export { V3_SHELL_DESTINATIONS };
