import { useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { useSolarisApp } from "@/components/app/AppRuntime";
import { useV3ResultsBundle } from "@/lib/v3-results-runtime";
import { useV3RolloutProbe } from "@/lib/v3-primary-runtime";
import { decideV3ShellForRoute } from "@/lib/v3-shell-route-boundary";
import { V3AppShell } from "./V3AppShell";
import { V3ResultsScreen } from "./V3ResultsScreen";

function ResolvingResultsSurface() {
  return (
    <main
      className="relative z-10 mx-auto w-full max-w-3xl px-4 py-10 sm:py-14"
      data-v3-results-boot=""
    >
      <header className="border-b border-border/70 pb-5">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-primary">
          Official results
        </p>
        <h1 className="mt-2 font-display text-3xl font-black tracking-[-0.04em] sm:text-5xl">
          Results
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Checking the latest publication-safe result experience.
        </p>
      </header>
      <p className="sr-only" role="status" aria-live="polite">
        Checking the current Results experience.
      </p>
    </main>
  );
}

/**
 * Reversible installed-app cutover for the Results root. The rollout decision
 * happens before the legacy archive-wide result hooks can mount. Public web and
 * every failed or disabled server decision preserve the existing Results route.
 */
export function V3ResultsRouteGate({ legacy }: { legacy: ReactNode }) {
  const { isAppMode, platformResolved } = useSolarisApp();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const searchStr = useRouterState({ select: (state) => state.location.searchStr });
  const rollout = useV3RolloutProbe(platformResolved && isAppMode);
  const shouldLoadBundle =
    platformResolved &&
    isAppMode &&
    rollout.data?.enabled === true &&
    rollout.data?.resultsEnabled === true;
  const bundleQuery = useV3ResultsBundle(shouldLoadBundle);

  if (!platformResolved) return <ResolvingResultsSurface />;
  if (!isAppMode) return <>{legacy}</>;
  if (rollout.isLoading) return <ResolvingResultsSurface />;
  if (
    rollout.isError ||
    rollout.data?.enabled !== true ||
    rollout.data?.resultsEnabled !== true
  ) {
    return <>{legacy}</>;
  }
  if (bundleQuery.isLoading) return <ResolvingResultsSurface />;
  if (bundleQuery.isError || !bundleQuery.data) return <>{legacy}</>;

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
  if (!shell.useV3Shell || shell.rootTab !== "results") return <>{legacy}</>;

  const bundle = bundleQuery.data;
  return (
    <V3AppShell
      editionLabel={bundle.shell.editionLabel}
      phaseLabel={bundle.shell.phaseLabel}
      activeArea="results"
    >
      <V3ResultsScreen projection={bundle.projection} />
    </V3AppShell>
  );
}
