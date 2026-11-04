import { lazy, Suspense, type ReactNode } from "react";

import { useSolarisApp } from "@/components/app/AppRuntime";
import { useHydrationSafeRouterLocation } from "@/lib/hydration-safe-router-location";
import { useV3RolloutProbe } from "@/lib/v3-primary-runtime";
import { decideV3ShellForRoute } from "@/lib/v3-shell-route-boundary";
import type { V3LegacyRouteShellArea } from "./V3LegacyRouteShell";

const LazyV3LegacyRouteShell = lazy(() =>
  import("./V3LegacyRouteShell").then((module) => ({ default: module.V3LegacyRouteShell })),
);

type LegacyCutoverTarget = {
  phaseLabel: string;
};

function routeMatchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function resolveV3LegacyCutoverTarget(
  pathname: string,
  searchStr: string,
): LegacyCutoverTarget | null {
  // Native V3 detail gates remain authoritative for these families. Only their
  // legacy directory roots are adapted here.
  if (pathname === "/countries") return { phaseLabel: "Countries" };
  if (pathname === "/editions") return { phaseLabel: "Editions" };

  if (routeMatchesPrefix(pathname, "/shows")) {
    const params = new URLSearchParams(searchStr.startsWith("?") ? searchStr.slice(1) : searchStr);
    return { phaseLabel: params.get("from") === "results" ? "Results" : "Shows" };
  }

  // Exact /results owns a native V3 root. Legacy descendants/redirects keep the
  // Results shell until their content is migrated individually.
  if (pathname.startsWith("/results/")) return { phaseLabel: "Results" };
  if (routeMatchesPrefix(pathname, "/wiki")) return { phaseLabel: "Wiki" };
  if (routeMatchesPrefix(pathname, "/encyclopedia")) return { phaseLabel: "Encyclopedia" };
  if (routeMatchesPrefix(pathname, "/pulse")) return { phaseLabel: "Pulse" };
  if (routeMatchesPrefix(pathname, "/analysis")) return { phaseLabel: "Analysis" };
  if (routeMatchesPrefix(pathname, "/compare")) return { phaseLabel: "Compare" };
  if (routeMatchesPrefix(pathname, "/voting-dna")) return { phaseLabel: "Voting DNA" };
  if (routeMatchesPrefix(pathname, "/tools")) return { phaseLabel: "Tools" };
  if (routeMatchesPrefix(pathname, "/guide")) return { phaseLabel: "Guide" };
  return null;
}

/**
 * Centralized installed-app cutover for legacy public content.
 *
 * The child route remains the single content/data authority. This component
 * changes chrome only, reusing the canonical server rollout probe and shell
 * safety boundary. Keeping the bridge at the root avoids creating a new TanStack
 * parent module (and client chunk) for every legacy route family.
 */
export function V3RootLegacyCutover({ children }: { children: ReactNode }) {
  const { isAppMode, platformResolved } = useSolarisApp();
  const { pathname, searchStr } = useHydrationSafeRouterLocation();
  const target = resolveV3LegacyCutoverTarget(pathname, searchStr);
  const rollout = useV3RolloutProbe(Boolean(target) && platformResolved && isAppMode);

  if (!target || !platformResolved || !isAppMode) return <>{children}</>;
  if (rollout.isLoading || rollout.isError || rollout.data?.enabled !== true) {
    return <>{children}</>;
  }

  const shell = decideV3ShellForRoute({
    pathname,
    search: searchStr,
    rolloutRule: { stage: "enabled" },
    rolloutContext: {
      userId: rollout.data.userId,
      editionId: rollout.data.editionId,
      isOrganizer: false,
    },
    isAuthenticated: Boolean(rollout.data.userId),
  });

  if (!shell.useV3Shell || !shell.rootTab) return <>{children}</>;
  if (shell.rootTab === "explore" && rollout.data.exploreEnabled !== true) {
    return <>{children}</>;
  }
  if (shell.rootTab === "results" && rollout.data.resultsEnabled !== true) {
    return <>{children}</>;
  }
  if (shell.rootTab === "me" && rollout.data.meEnabled !== true) {
    return <>{children}</>;
  }

  return (
    <Suspense fallback={<>{children}</>}>
      <LazyV3LegacyRouteShell
        phaseLabel={target.phaseLabel}
        activeArea={shell.rootTab as V3LegacyRouteShellArea}
      >
        {children}
      </LazyV3LegacyRouteShell>
    </Suspense>
  );
}
