import { useRouterState } from "@tanstack/react-router";
import { lazy, Suspense, type ReactNode } from "react";

import { useSolarisApp } from "@/components/app/AppRuntime";
import { useV3RolloutProbe } from "@/lib/v3-primary-runtime";
import { decideV3ShellForRoute } from "@/lib/v3-shell-route-boundary";
import type { V3LegacyRouteShellArea } from "./V3LegacyRouteShell";

const LazyV3LegacyRouteShell = lazy(() =>
  import("./V3LegacyRouteShell").then((module) => ({ default: module.V3LegacyRouteShell })),
);

/**
 * Transitional shell adapter for public routes whose canonical content/data
 * pipeline is already correct but whose route still owns the previous AppShell.
 *
 * This deliberately does not copy, refetch or reinterpret route data. The
 * existing child route remains the single content authority while installed V3
 * gets the canonical V3 chrome. Critical, immersive, auth and unsupported
 * routes continue to fail closed through decideV3ShellForRoute().
 *
 * The actual V3 chrome stays behind a dynamic import so adding this lightweight
 * parent adapter to legacy route families does not pull the full V3 navigation,
 * command palette and attention stack into their initial client chunks.
 */
export function V3LegacyRouteAdapter({
  children,
  phaseLabel,
}: {
  children: ReactNode;
  phaseLabel?: string;
}) {
  const { isAppMode, platformResolved } = useSolarisApp();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const searchStr = useRouterState({ select: (state) => state.location.searchStr });
  const rollout = useV3RolloutProbe(platformResolved && isAppMode);

  // Public web remains byte-for-byte on its established shell. During the
  // hydration-safe platform decision we also preserve the established route,
  // rather than replacing indexable public content with an app-only loader.
  if (!platformResolved || !isAppMode) return <>{children}</>;
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
      // The persisted rollout probe already evaluated privileged rollout
      // policy. This adapter owns public shell selection only.
      isOrganizer: false,
    },
    isAuthenticated: Boolean(rollout.data.userId),
  });

  if (!shell.useV3Shell || !shell.rootTab) return <>{children}</>;

  // Preserve the independently reversible product cutovers. A global V3 flag
  // must never make an Explore/Results/Me deep route impossible to roll back.
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
        phaseLabel={phaseLabel}
        activeArea={shell.rootTab as V3LegacyRouteShellArea}
      >
        {children}
      </LazyV3LegacyRouteShell>
    </Suspense>
  );
}
