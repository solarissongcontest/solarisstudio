import { V3ResultReadUnavailable } from "./V3ResultReadUnavailable";
import { useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { useSolarisApp } from "@/components/app/AppRuntime";
import { useAppExperiencePreferences } from "@/lib/app-experience";
import { useNotificationPreferences } from "@/lib/engagement-data";
import { useV3DelegationBundle } from "@/lib/v3-delegation-runtime";
import { useV3RolloutProbe } from "@/lib/v3-primary-runtime";
import { resolveV3ResultsSpoilerProtection } from "@/lib/v3-results";
import { decideV3ShellForRoute } from "@/lib/v3-shell-route-boundary";
import { V3AppShell } from "./V3AppShell";
import { V3DelegationScreen } from "./V3DelegationScreen";

function ResolvingDelegationSurface({ code }: { code: string }) {
  return (
    <main
      className="relative z-10 mx-auto w-full max-w-3xl px-4 py-10 sm:py-14"
      data-v3-explore-boot=""
      data-v3-delegation-boot=""
    >
      <header className="border-b border-border/70 pb-5">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-primary">
          Solaris delegation
        </p>
        <h1 className="mt-2 font-display text-3xl font-black tracking-[-0.04em] sm:text-5xl">
          Opening {code.trim().toUpperCase() || "delegation"}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Checking the publication-safe Delegation experience.
        </p>
      </header>
      <p className="sr-only" role="status" aria-live="polite">
        Checking the current Delegation experience.
      </p>
    </main>
  );
}

/**
 * Reversible installed-app cutover for public country/delegation detail. The
 * legacy route remains the public-web and explicit disabled-rollout fallback. Its archive-wide
 * hooks are passed as children, so they never mount while V3 owns the route.
 */
export function V3DelegationRouteGate({
  code,
  legacy,
}: {
  code: string;
  legacy: ReactNode;
}) {
  const { isAppMode, platformResolved } = useSolarisApp();
  const { preferences } = useAppExperiencePreferences();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const searchStr = useRouterState({ select: (state) => state.location.searchStr });
  const rollout = useV3RolloutProbe(platformResolved && isAppMode);
  const serverPreferences = useNotificationPreferences(rollout.data?.userId ?? undefined);
  const shouldLoadBundle =
    platformResolved &&
    isAppMode &&
    rollout.data?.enabled === true &&
    rollout.data?.exploreEnabled === true &&
    rollout.data?.delegationEnabled === true;
  const bundleQuery = useV3DelegationBundle(code, shouldLoadBundle);
  const hideResultSpoilers = resolveV3ResultsSpoilerProtection({
    localSpoilerFree: preferences.spoilerFree,
    viewerResolved: Boolean(rollout.data),
    viewerId: rollout.data?.userId ?? null,
    serverPending: serverPreferences.isPending,
    serverError: serverPreferences.isError,
    serverSpoilerFree: serverPreferences.data?.spoiler_free ?? null,
  });

  if (!platformResolved) return <ResolvingDelegationSurface code={code} />;
  if (!isAppMode) return <>{legacy}</>;
  if (rollout.isLoading) return <ResolvingDelegationSurface code={code} />;
  if (rollout.isError || !rollout.data) return <V3ResultReadUnavailable />;
  if (
    rollout.data?.enabled !== true ||
    rollout.data?.exploreEnabled !== true ||
    rollout.data?.delegationEnabled !== true
  ) {
    return <>{legacy}</>;
  }
  if (bundleQuery.isLoading) return <ResolvingDelegationSurface code={code} />;
  if (bundleQuery.isError || !bundleQuery.data) return <V3ResultReadUnavailable />;

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
  if (!shell.useV3Shell || shell.rootTab !== "explore") return <>{legacy}</>;

  const bundle = bundleQuery.data;
  return (
    <V3AppShell
      editionLabel={bundle.shell.editionLabel}
      phaseLabel={bundle.shell.phaseLabel}
      activeArea="explore"
    >
      <V3DelegationScreen
        projection={bundle.projection}
        hideResultSpoilers={hideResultSpoilers}
      />
    </V3AppShell>
  );
}
