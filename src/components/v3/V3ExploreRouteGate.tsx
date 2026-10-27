import { V3ResultReadUnavailable } from "./V3ResultReadUnavailable";
import { useRouterState } from "@tanstack/react-router";
import { useRef, type ReactNode } from "react";

import { useSolarisApp } from "@/components/app/AppRuntime";
import { PublicCommandPalette } from "@/components/public/PublicCommandPalette";
import { useV3ExploreBundle } from "@/lib/v3-explore-runtime";
import { useV3RolloutProbe } from "@/lib/v3-primary-runtime";
import { decideV3ShellForRoute } from "@/lib/v3-shell-route-boundary";
import { V3AppShell } from "./V3AppShell";
import { V3ExploreScreen } from "./V3ExploreScreen";

function ResolvingExploreSurface() {
  return (
    <main
      className="relative z-10 mx-auto w-full max-w-3xl px-4 py-10 sm:py-14"
      data-v3-explore-boot=""
    >
      <header className="border-b border-border/70 pb-5">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-primary">
          Explore Solaris
        </p>
        <h1 className="mt-2 font-display text-3xl font-black tracking-[-0.04em] sm:text-5xl">
          Discover the contest
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Browse public editions, delegations, songs, shows and stories across Solaris.
        </p>
      </header>
      <p className="sr-only" role="status" aria-live="polite">
        Checking the current Explore experience.
      </p>
    </main>
  );
}

/**
 * Reversible installed-app cutover for Explore. Public web and an explicit disabled
 * server decision keep the existing route. Failed enabled reads stay unavailable. The V3 data graph is not
 * started until the server-authoritative Explore slice flag evaluates true.
 */
export function V3ExploreRouteGate({ legacy }: { legacy: ReactNode }) {
  const { isAppMode, platformResolved } = useSolarisApp();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const searchStr = useRouterState({ select: (state) => state.location.searchStr });
  const legacySearchHostRef = useRef<HTMLDivElement>(null);
  const rollout = useV3RolloutProbe(platformResolved && isAppMode);
  const shouldLoadBundle =
    platformResolved &&
    isAppMode &&
    rollout.data?.enabled === true &&
    rollout.data?.exploreEnabled === true;
  const bundleQuery = useV3ExploreBundle(shouldLoadBundle);

  // Keep the hydration pass query-free. This prevents an installed client from
  // mounting the legacy Explore archive graph before the server rollout choice
  // is known.
  if (!platformResolved) return <ResolvingExploreSurface />;
  if (!isAppMode) return <>{legacy}</>;
  if (rollout.isLoading) return <ResolvingExploreSurface />;
  if (rollout.isError || !rollout.data) return <V3ResultReadUnavailable />;
  if (
    rollout.data?.enabled !== true ||
    rollout.data?.exploreEnabled !== true
  ) {
    return <>{legacy}</>;
  }
  if (bundleQuery.isLoading) return <ResolvingExploreSurface />;
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
  if (!shell.useV3Shell) return <>{legacy}</>;

  const bundle = bundleQuery.data;
  const globalSearchEnabled = rollout.data.searchEnabled === true;
  const openCanonicalSearch = () => {
    const owner = globalSearchEnabled
      ? document.querySelector<HTMLElement>('[data-v3-search-owner="canonical"]')
      : legacySearchHostRef.current;
    owner
      ?.querySelector<HTMLButtonElement>('button[aria-label="Search Solaris Studio"]')
      ?.click();
  };

  return (
    <V3AppShell
      editionLabel={bundle.shell.editionLabel}
      phaseLabel={bundle.shell.phaseLabel}
      topActions={
        !globalSearchEnabled ? (
          <div ref={legacySearchHostRef} data-v3-explore-search-owner="canonical">
            <PublicCommandPalette compact />
          </div>
        ) : undefined
      }
    >
      <V3ExploreScreen
        projection={bundle.projection}
        onOpenSearch={openCanonicalSearch}
      />
    </V3AppShell>
  );
}
