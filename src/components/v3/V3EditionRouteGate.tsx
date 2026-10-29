import { useRouterState } from "@tanstack/react-router";
import { type ReactNode } from "react";

import { useSolarisApp } from "@/components/app/AppRuntime";
import { PublicCommandPalette } from "@/components/public/PublicCommandPalette";
import { useAppExperiencePreferences } from "@/lib/app-experience";
import { useNotificationPreferences } from "@/lib/engagement-data";
import { useV3EditionBundle } from "@/lib/v3-edition-runtime";
import { resolveV3EditionCollectionView } from "@/lib/v3-edition-view";
import { useV3EditionRolloutProbe } from "@/lib/v3-primary-runtime";
import { resolveV3ResultsSpoilerProtection } from "@/lib/v3-results";
import { decideV3ShellForRoute } from "@/lib/v3-shell-route-boundary";
import { V3AppShell } from "./V3AppShell";
import { V3EditionParticipantsScreen } from "./V3EditionParticipantsScreen";
import { V3EditionProductScreen } from "./V3EditionProductScreen";

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
  const { preferences } = useAppExperiencePreferences();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const searchStr = useRouterState({ select: (state) => state.location.searchStr });
  const editionView = resolveV3EditionCollectionView(searchStr);
  const rollout = useV3EditionRolloutProbe(
    slug,
    platformResolved && isAppMode,
  );
  const serverPreferences = useNotificationPreferences(rollout.data?.userId ?? undefined);
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
  const globalSearchEnabled = rollout.data.searchEnabled === true;
  const hideSpoilers = resolveV3ResultsSpoilerProtection({
    localSpoilerFree: preferences.spoilerFree,
    viewerResolved: true,
    viewerId: rollout.data.userId ?? null,
    serverPending: serverPreferences.isPending,
    serverError: serverPreferences.isError,
    serverSpoilerFree: serverPreferences.data?.spoiler_free ?? null,
  });
  const screenKey = `${rollout.data.userId ?? "anonymous"}:${slug}:${editionView ?? "overview"}:${hideSpoilers}`;

  return (
    <V3AppShell
      editionLabel={bundle.shell.editionLabel}
      phaseLabel={bundle.shell.phaseLabel}
      topActions={
        !globalSearchEnabled ? (
          <div data-v3-edition-search-owner="canonical">
            <PublicCommandPalette compact />
          </div>
        ) : undefined
      }
    >
      {editionView === "participants" ? (
        <V3EditionParticipantsScreen
          key={screenKey}
          projection={bundle.projection}
          spoilerSafe={hideSpoilers}
        />
      ) : (
        <V3EditionProductScreen
          key={screenKey}
          projection={bundle.projection}
          hideSpoilers={hideSpoilers}
          view={editionView}
        />
      )}
    </V3AppShell>
  );
}
