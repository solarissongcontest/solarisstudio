import { useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { useSolarisApp } from "@/components/app/AppRuntime";
import { useV3PrimarySurfaceBundle, useV3RolloutProbe } from "@/lib/v3-primary-runtime";
import { shouldLoadV3PrimaryBundle } from "@/lib/v3-primary-route-cutover";
import { decideV3ShellForRoute } from "@/lib/v3-shell-route-boundary";
import { V3AppShell } from "./V3AppShell";
import { V3HomeScreen } from "./V3HomeScreen";
import { V3ParticipateScreen } from "./V3ParticipateScreen";

type V3PrimarySurface = "home" | "participate";

function LoadingPrimarySurface() {
  return (
    <main
      className="relative z-10 mx-auto flex min-h-[45dvh] w-full max-w-xl items-center justify-center px-4 text-center"
      data-v3-primary-boot=""
    >
      <div role="status" aria-live="polite">
        <p className="text-sm font-semibold">Loading Solaris</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Checking the current app experience.
        </p>
      </div>
    </main>
  );
}

/**
 * Reversible production gate for the first V3 route cutover.
 *
 * Public web never enters this gate. A disabled/unavailable rollout, bootstrap
 * failure or unsafe route returns the existing route unchanged. Participate is
 * deliberately signed-in-only for this first slice so anonymous public-voting
 * parity remains on the proven legacy route until its V3 projection is ready.
 */
export function V3PrimaryRouteGate({
  surface,
  legacy,
}: {
  surface: V3PrimarySurface;
  legacy: ReactNode;
}) {
  const { isAppMode, platformResolved } = useSolarisApp();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const searchStr = useRouterState({ select: (state) => state.location.searchStr });
  const rollout = useV3RolloutProbe(platformResolved && isAppMode);
  const shouldLoadBundle = shouldLoadV3PrimaryBundle({
    isAppMode: platformResolved && isAppMode,
    surface,
    rolloutEnabled: rollout.data?.enabled === true,
    rolloutUserId: rollout.data?.userId ?? null,
  });
  const bundleQuery = useV3PrimarySurfaceBundle(
    shouldLoadBundle,
    rollout.data?.editionId,
    rollout.data?.userId,
  );

  // The hydration-safe AppRuntime starts as web until browser platform detection
  // commits. Do not mount AppShell or either route data graph during that
  // indeterminate pass: an installed app may be about to select V3 instead.
  if (!platformResolved) return <LoadingPrimarySurface />;
  if (!isAppMode) return <>{legacy}</>;
  if (rollout.isLoading) return <LoadingPrimarySurface />;
  if (rollout.isError || rollout.data?.enabled !== true) return <>{legacy}</>;
  if (surface === "participate" && !rollout.data.userId) return <>{legacy}</>;
  if (bundleQuery.isLoading) return <LoadingPrimarySurface />;
  if (bundleQuery.isError || !bundleQuery.data) return <>{legacy}</>;

  const bundle = bundleQuery.data;
  const isAuthenticated = Boolean(bundle.bootstrap.identity.userId);
  if (surface === "participate" && !isAuthenticated) return <>{legacy}</>;

  const shell = decideV3ShellForRoute({
    pathname,
    search: searchStr,
    rolloutRule: { stage: "enabled" },
    rolloutContext: {
      userId: rollout.data.userId,
      editionId: rollout.data.editionId,
      // The persisted feature-flag RPC has already evaluated admins_only in the
      // authenticated server context. This second layer only owns route safety.
      isOrganizer: false,
    },
    isAuthenticated,
  });

  if (!shell.useV3Shell) return <>{legacy}</>;

  return (
    <V3AppShell
      editionLabel={bundle.shell.editionLabel}
      phaseLabel={bundle.shell.phaseLabel}
      participateAttentionCount={bundle.shell.participateAttentionCount}
    >
      {surface === "home" ? (
        <V3HomeScreen
          bootstrap={bundle.home.bootstrap}
          currentContest={bundle.home.currentContest}
          upcoming={bundle.home.upcoming}
          latest={bundle.home.latest}
          liveShowLabel={bundle.home.liveShowLabel}
          resultsLabel={bundle.home.resultsLabel}
        />
      ) : (
        <V3ParticipateScreen
          bootstrap={bundle.participate.bootstrap}
          progressByActionId={bundle.participate.progressByActionId}
          delegationLabel={bundle.participate.delegationLabel}
        />
      )}
    </V3AppShell>
  );
}