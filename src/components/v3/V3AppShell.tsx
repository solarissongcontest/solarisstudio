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
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

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
  type V3PublicHistoryEntry,
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
import { V3TopLevelNavigationViewport } from "./V3TopLevelNavigationViewport";

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

export type V3TopLevelSwipeTarget = {
  tabId: V3Area;
  entry: V3PublicHistoryEntry;
  href: string;
};

export type V3TopLevelSwipePreviewRenderer = (
  target: V3TopLevelSwipeTarget,
) => ReactNode | null;

/**
 * Route owners may opt a canonical top-level screen into whole-page swipe by
 * supplying live adjacent React surfaces. The shell owns target resolution,
 * route memory and commit. Renderers only decide whether they can safely render
 * the exact adjacent target from data already owned by that route boundary.
 *
 * A renderer returning null keeps swipe disabled. This prevents the shell from
 * inventing preview data, mounting all five applications, or starting hidden
 * network graphs merely to make the gesture look complete.
 */
export type V3TopLevelNavigationPreviews = {
  ready: boolean;
  previous?: V3TopLevelSwipePreviewRenderer;
  next?: V3TopLevelSwipePreviewRenderer;
  generation?: string;
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
  topLevelSwipePreviews?: V3TopLevelNavigationPreviews;
};

/**
 * Migration-ready V3 chrome.
 *
 * Canonical route ownership stays in TanStack Router and the screen registry.
 * The Liquid bar provides direct manipulation as progressive enhancement, but
 * every destination remains a semantic link and this shell never invents a
 * second URL/state model. Per-tab memory is viewer-scoped and rejects focused,
 * immersive and critical-task routes. Whole-page swipe is fail-closed and only
 * arms when the current route owner explicitly supplies the required live
 * adjacent DOM surfaces for the exact remembered tab targets. Screenshots,
 * shell-owned data fetching and permanently mounted five-tab applications are
 * not accepted as preview substitutes.
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
  topLevelSwipePreviews,
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
  // unresolved authenticated session as anonymous could leak that user's Me
  // route into the anonymous storage bucket.
  const navigationIdentityReady =
    !rollout.isLoading && !rollout.isError && rollout.data != null;
  const navigationScope = navigationIdentityReady ? (rollout.data.userId ?? null) : null;
  const resolvedViewerKey = navigationScope ?? "anonymous";
  // Interaction ownership is stricter than storage scope. An unresolved viewer
  // is not the same generation as an explicitly anonymous viewer. Remounting
  // the Liquid primitive on these transitions guarantees pointer capture,
  // long-press and drag state cannot cross login/logout identity handoffs.
  const navigationInteractionKey = navigationIdentityReady
    ? (navigationScope ?? "anonymous")
    : "resolving";
  const previousResolvedViewerKeyRef = useRef<string | undefined>(undefined);
  const notificationLabel =
    attention.me > 0
      ? `Notifications, ${attention.me} ${attention.me === 1 ? "item" : "items"} need attention`
      : "Notifications";

  useEffect(() => {
    if (typeof window === "undefined" || !navigationIdentityReady) return;

    const previousViewerKey = previousResolvedViewerKeyRef.current;
    previousResolvedViewerKeyRef.current = resolvedViewerKey;
    if (previousViewerKey !== undefined && previousViewerKey !== resolvedViewerKey) {
      // Auth can resolve before its redirect commits. Do not sample the old
      // viewer's still-mounted route into the newly resolved viewer bucket.
      // Memory resumes after the authoritative route/query changes.
      return;
    }

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
  }, [
    navigationIdentityReady,
    navigationScope,
    pathname,
    resolvedViewerKey,
    searchStr,
  ]);

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

  const navigationStorage = navigationIdentityReady ? undefined : null;
  const resolveDestinationTarget = (index: number): V3TopLevelSwipeTarget | null => {
    if (!navigationIdentityReady || index < 0 || index >= V3_SHELL_DESTINATIONS.length) {
      return null;
    }
    const destination = V3_SHELL_DESTINATIONS[index];
    if (!destination) return null;
    const entry = getV3PublicTabDestination(
      destination.id,
      navigationStorage,
      navigationScope,
    );
    return {
      tabId: destination.id,
      entry,
      href: v3PublicEntryHref(entry),
    };
  };

  const activeDestinationIndex = publicArea
    ? V3_SHELL_DESTINATIONS.findIndex((destination) => destination.id === publicArea)
    : -1;
  const previousSwipeTarget = resolveDestinationTarget(activeDestinationIndex - 1);
  const nextSwipeTarget = resolveDestinationTarget(activeDestinationIndex + 1);
  const previousSwipeSurface =
    previousSwipeTarget && topLevelSwipePreviews?.previous
      ? topLevelSwipePreviews.previous(previousSwipeTarget)
      : null;
  const nextSwipeSurface =
    nextSwipeTarget && topLevelSwipePreviews?.next
      ? topLevelSwipePreviews.next(nextSwipeTarget)
      : null;
  const swipePreviewReady =
    navigationIdentityReady && topLevelSwipePreviews?.ready === true;
  const swipeInteractionKey = `${navigationInteractionKey}:${topLevelSwipePreviews?.generation ?? "default"}`;

  const selectDestination = (destination: V3LiquidTabDestination) => {
    const id = destination.id as V3PublicTabId;
    const alreadyActive = publicArea === id;
    const normalizedPath =
      pathname.endsWith("/") && pathname !== "/" ? pathname.slice(0, -1) : pathname;
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
    const target = alreadyActive
      ? resetV3PublicTabToRoot(id, navigationStorage, navigationScope)
      : getV3PublicTabDestination(id, navigationStorage, navigationScope);
    if (navigationIdentityReady) {
      markV3PublicNavigationRestore(target, undefined, navigationScope);
    }

    void runAppViewTransition(alreadyActive ? "pop" : "tab", () =>
      navigate({ to: v3PublicEntryHref(target) as any }),
    );
  };

  const commitSwipeDestination = (targetIndex: number) => {
    if (!navigationIdentityReady || targetIndex === activeDestinationIndex) return;
    // Commit the exact target snapshot whose live DOM surface the user dragged
    // toward. Do not re-read tab memory after the gesture because another tab or
    // storage event could otherwise make the route differ from the preview.
    const target =
      targetIndex === activeDestinationIndex - 1
        ? previousSwipeTarget
        : targetIndex === activeDestinationIndex + 1
          ? nextSwipeTarget
          : null;
    if (!target) return;

    markV3PublicNavigationRestore(target.entry, undefined, navigationScope);
    // The page and Liquid lens are already settling as one continuous gesture.
    // A second View Transition here would create a competing animation owner.
    void navigate({ to: target.href as any });
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

  const content = topLevelSwipePreviews ? (
    <V3TopLevelNavigationViewport
      pathname={pathname}
      searchStr={searchStr}
      activeIndex={activeDestinationIndex >= 0 ? activeDestinationIndex : 0}
      itemCount={V3_SHELL_DESTINATIONS.length}
      previousSurface={previousSwipeSurface}
      nextSurface={nextSwipeSurface}
      previewReady={swipePreviewReady}
      interactionKey={swipeInteractionKey}
      onCommit={commitSwipeDestination}
    >
      {children}
    </V3TopLevelNavigationViewport>
  ) : (
    children
  );

  return (
    <V3FoundationShell>
      <div className={cn("min-h-dvh", className)}>
        <V3TopContext edition={editionLabel} phase={phaseLabel} actions={shellActions} />
        <V3DesktopPrimaryNavigation
          destinations={navigationDestinations}
          onSelect={selectDestination}
        />
        {content}
      </div>

      <V3LiquidTabBar
        key={navigationInteractionKey}
        pathname={pathname}
        destinations={navigationDestinations}
        onSelect={selectDestination}
      />
    </V3FoundationShell>
  );
}

export { V3_SHELL_DESTINATIONS };
