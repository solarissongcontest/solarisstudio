import { useRouterState } from "@tanstack/react-router";
import { useRef, type ReactNode } from "react";

import { useSolarisApp } from "@/components/app/AppRuntime";
import { PublicCommandPalette } from "@/components/public/PublicCommandPalette";
import { useV3EditionBundle } from "@/lib/v3-edition-runtime";
import { useV3RolloutProbe } from "@/lib/v3-primary-runtime";
import { decideV3ShellForRoute } from "@/lib/v3-shell-route-boundary";
import { V3AppShell } from "./V3AppShell";
import { V3EditionHubScreen } from "./V3EditionHubScreen";

function ResolvingEditionSurface() {
  return (
    <main
      className="relative z-10 mx-auto w-full max-w-3xl px-4 py-10 sm:py-14"
      data-v3-edition-boot=""
    >
      <header className="border-b border-border/70 pb-5">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-primary">
          Solaris edition
        </p>
        <h1 className="mt-2 font-display text-3xl font-black tracking-[-0.04em] sm:text-5xl">
          Opening edition
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Checking the publication-safe Edition experience.
        </p>
      </header>
      <p className="sr-only" role="status" aria-live="polite">
        Checking the current Edition experience.
      </p>
    </main>
  );
}

/**
 * Reversible installed-app cutover for public Edition detail. Public web and
 * every disabled, unavailable, unpublished or malformed state keep the legacy
 * route. The legacy archive hooks are children and therefore do not mount while
 * this gate owns the route.
 */
export function V3EditionRouteGate({
  slug,
  legacy,
}: {
  slug: string;
  legacy: ReactNode;
}) {
  const { isAppMode, platformResolved } = useSolarisApp();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const searchStr = useRouterState({ select: (state) => state.location.searchStr });
  const searchHostRef = useRef<HTMLDivElement>(null);
  const rollout = useV3RolloutProbe(platformResolved && isAppMode);
  const shouldLoadBundle =
    platformResolved &&
    isAppMode &&
    rollout.data?.enabled === true &&
    rollout.data?.exploreEnabled === true &&
    rollout.data?.editionHubEnabled === true;
  const bundleQuery = useV3EditionBundle(slug, shouldLoadBundle);

  if (!platformResolved) return <ResolvingEditionSurface />;
  if (!isAppMode) return <>{legacy}</>;
  if (rollout.isLoading) return <ResolvingEditionSurface />;
  if (
    rollout.isError ||
    rollout.data?.enabled !== true ||
    rollout.data?.exploreEnabled !== true ||
    rollout.data?.editionHubEnabled !== true
  ) {
    return <>{legacy}</>;
  }
  if (bundleQuery.isLoading) return <ResolvingEditionSurface />;
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
  if (!shell.useV3Shell || shell.rootTab !== "explore") return <>{legacy}</>;

  const bundle = bundleQuery.data;
  const openCanonicalSearch = () => {
    searchHostRef.current
      ?.querySelector<HTMLButtonElement>('button[aria-label="Search Solaris Studio"]')
      ?.click();
  };

  return (
    <V3AppShell
      editionLabel={bundle.shell.editionLabel}
      phaseLabel={bundle.shell.phaseLabel}
      topActions={
        <div ref={searchHostRef} data-v3-edition-search-owner="canonical">
          <PublicCommandPalette compact />
          <button type="button" className="sr-only" onClick={openCanonicalSearch}>
            Open Solaris search
          </button>
        </div>
      }
    >
      <V3EditionHubScreen projection={bundle.projection} />
    </V3AppShell>
  );
}
