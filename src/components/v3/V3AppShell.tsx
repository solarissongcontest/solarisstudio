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
import { V3DesktopPrimaryNavigation } from "./V3DesktopPrimaryNavigation";
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

export type V3TopLevelSwipePreviewSurface = {
  /** Canonical root represented by this live surface. */
  area: V3Area;
  /** Live DOM content owned by the Public route layer. */
  surface: ReactNode;
};

export type V3TopLevelSwipePreviewSurfaces = {
  previous?: V3TopLevelSwipePreviewSurface;
  next?: V3TopLevelSwipePreviewSurface;
};

export type V3AppShellProps = {
  children: ReactNode;
  editionLabel: string;
  phaseLabel?: string | null;
  participateAttentionCount?: number;
  activeArea?: V3Area;
  topActions?: ReactNode;
  className?: string;
  /**
   * Live adjacent root surfaces supplied by the Public route owner. Each
   * surface carries the canonical root it represents so stale cache/auth/route
   * handoffs cannot briefly render the wrong adjacent page. The shell never
   * fabricates or fetches these previews; invalid or missing identity keeps
   * page swipe fail-closed while ordinary tab navigation remains available.
   */
  swipePreviewSurfaces?: V3TopLevelSwipePreviewSurfaces;
};

function focusCurrentRouteAfterSwipe() {
  if (typeof document === "undefined" || typeof window === "undefined") return;

  window.requestAnimationFrame(() => {
    const target = document.querySelector<HTMLElement>(
      ".v3-top-level-swipe-page--current main, main.v3-screen, main",
    );
    if (!target) return;

    const previousTabIndex = target.getAttribute("tabindex");
    target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
    if (previousTabIndex == null) target.removeAttribute("tabindex");
    else target.setAttribute("tabindex", previousTabIndex);
  });
}

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
  swipePreviewSurfaces,
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
  // Route memory is viewer-scoped, but the scope itself is not trustworthy
  // until the server-owned rollout/bootstrap probe has resolved. Treating an
  // unresolved authenticated session as "anonymous" would let a cold deep link
  // briefly write that user's Me route into the anonymous storage bucket.
  const navigationIdentityReady =
    !rollout.isLoading && !rollout.isError && rollout.data != null;
  const navigationScope = navigationIdentityReady ? (rollout.data.userId ?? null) : null;
  const notificationLabel =
    attention.me > 0
      ? `Notifications, ${attention.me} ${attention.me === 1 ? "item" : "items"} need attention`
      : "Notifications";

  useEffect(() => {
    if (typeof window === "undefined" || !navigationIdentityReady) return;

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
  }, [navigationIdentityReady, navigationScope, pathname, searchStr]);

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
            aria-label={notificationLabel}
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

  const expectedPreviousArea =
    activeIndex > 0 ? (liquidDestinations[activeIndex - 1]?.id as V3Area | undefined) : undefined;
  const expectedNextArea =
    activeIndex < liquidDestinations.length - 1
      ? (liquidDestinations[activeIndex + 1]?.id as V3Area | undefined)
      : undefined;
  const previousPreview = swipePreviewSurfaces?.previous;
  const nextPreview = swipePreviewSurfaces?.next;
  const previousSurface =
    expectedPreviousArea && previousPreview?.area === expectedPreviousArea
      ? previousPreview.surface
      : null;
  const nextSurface =
    expectedNextArea && nextPreview?.area === expectedNextArea
      ? nextPreview.surface
      : null;
  const swipePreviewReady =
    navigationIdentityReady &&
    swipePreviewSurfaces != null &&
    (expectedPreviousArea == null || previousSurface != null) &&
    (expectedNextArea == null || nextSurface != null);

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

    // Until viewer identity resolves, semantic navigation still works but uses
    // canonical roots only. Passing null storage avoids reading/writing the
    // anonymous memory bucket with an identity we do not yet know is anonymous.
    const navigationStorage = navigationIdentityReady ? undefined : null;
    const target = alreadyActive
      ? resetV3PublicTabToRoot(id, navigationStorage, navigationScope)
      : getV3PublicTabDestination(id, navigationStorage, navigationScope);
    if (navigationIdentityReady) {
      markV3PublicNavigationRestore(target, undefined, navigationScope);
    }
    const navigateToTarget = () => navigate({ to: v3PublicEntryHref(target) as any });

    if (navigationMode === "swipe") {
      // The swipe compositor already owns the transition. Commit the canonical
      // route immediately and do not start a second View Transition animation.
      void navigateToTarget();
      return;
    }

    void runAppViewTransition(alreadyActive ? "pop" : "tab", navigateToTarget);
  };

  return (
    <V3FoundationShell>
      <div className={cn("min-h-dvh", className)}>
        <V3TopContext edition={editionLabel} phase={phaseLabel} actions={shellActions} />
        <V3DesktopPrimaryNavigation
          destinations={liquidDestinations}
          onSelect={openTab}
        />
        <V3TopLevelSwipeSurface
          pathname={pathname}
          searchStr={searchStr}
          activeIndex={activeIndex}
          itemCount={liquidDestinations.length}
          previousSurface={previousSurface}
          nextSurface={nextSurface}
          previewReady={swipePreviewReady}
          interactionKey={navigationScope}
          onCommit={(targetIndex) => {
            const target = liquidDestinations[targetIndex];
            if (target) openTab(target, "swipe");
          }}
          onSettled={() => focusCurrentRouteAfterSwipe()}
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
