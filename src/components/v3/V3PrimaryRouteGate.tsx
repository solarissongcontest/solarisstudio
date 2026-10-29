import { useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { useSolarisApp } from "@/components/app/AppRuntime";
import { useV3PrimarySurfaceBundle, useV3RolloutProbe } from "@/lib/v3-primary-runtime";
import {
  resolveV3PrimarySurface,
  shouldLoadV3PrimaryBundle,
} from "@/lib/v3-primary-route-cutover";
import { decideV3ShellForRoute } from "@/lib/v3-shell-route-boundary";
import { V3AppShell } from "./V3AppShell";
import { V3Screen, V3ScreenHeader, V3Surface } from "./V3Foundation";
import { V3HomeScreen } from "./V3HomeScreen";
import { V3ParticipateScreen } from "./V3ParticipateScreen";

type V3PrimarySurface = "home" | "participate";

function ResolvingPrimarySurface({ surface }: { surface: V3PrimarySurface }) {
  const home = surface === "home";
  return (
    <main
      className="relative z-10 mx-auto w-full max-w-3xl px-4 py-10 sm:py-14"
      data-v3-primary-boot=""
    >
      <header className="border-b border-border/70 pb-5">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-primary">
          Solaris Song Contest
        </p>
        <h1 className="mt-2 font-display text-3xl font-black tracking-[-0.04em] sm:text-5xl">
          {home ? "Solaris Today" : "Participate in Solaris"}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          {home
            ? "Follow the current contest, explore delegations and editions, and open published Solaris results and show information."
            : "Open the official participation area for delegation confirmations, jury voting, televoting and other available contest actions."}
        </p>
      </header>

      <nav
        className="mt-5 flex flex-wrap gap-x-5 gap-y-3 text-sm font-semibold"
        aria-label={home ? "Solaris public navigation" : "Solaris participation navigation"}
      >
        {home ? (
          <>
            <a className="text-primary hover:underline" href="/countries">
              Delegations
            </a>
            <a className="text-primary hover:underline" href="/editions">
              Editions
            </a>
            <a className="text-primary hover:underline" href="/records">
              Records
            </a>
            <a className="text-primary hover:underline" href="/participate">
              Participate
            </a>
          </>
        ) : (
          <>
            <a className="text-primary hover:underline" href="/confirmations">
              Confirmations
            </a>
            <a className="text-primary hover:underline" href="/jury-voting">
              Jury voting
            </a>
            <a className="text-primary hover:underline" href="/televoting">
              Televoting
            </a>
            <a className="text-primary hover:underline" href="/">
              Solaris Today
            </a>
          </>
        )}
      </nav>

      <p className="sr-only" role="status" aria-live="polite">
        Checking the current app experience.
      </p>
    </main>
  );
}

function V3PrimarySurfaceReadError({
  surface,
  onRetry,
  retrying,
}: {
  surface: V3PrimarySurface;
  onRetry: () => void;
  retrying: boolean;
}) {
  const participate = surface === "participate";
  return (
    <V3AppShell
      editionLabel="Solaris Studio"
      phaseLabel={participate ? "Participate" : "Today"}
    >
      <V3Screen>
        <div data-v3-primary-read-state="error">
          <V3ScreenHeader
            kicker={participate ? "Participate" : "Solaris Today"}
            title={participate ? "Current responsibilities could not be verified" : "Current contest state could not be verified"}
            description={
              participate
                ? "Solaris could not confirm the server-authoritative participation projection. No responsibility, deadline, completion or voting state has been assumed from stale browser data."
                : "Solaris could not confirm the current public contest projection. This view will not substitute stale client state for the authoritative read."
            }
          />
          <V3Surface level="raised" className="p-5">
            <div role="alert">
              <p className="text-sm font-semibold">Authoritative read unavailable</p>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--v3-text-secondary)]">
                Retry the canonical read. If the session or edition context changed, Solaris will reconcile from the server response rather than keeping the previous page state.
              </p>
              <button
                type="button"
                disabled={retrying}
                onClick={onRetry}
                className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-[var(--v3-border-subtle)] bg-white/[0.035] px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              >
                {retrying ? "Retrying…" : "Retry authoritative read"}
              </button>
            </div>
          </V3Surface>
        </div>
      </V3Screen>
    </V3AppShell>
  );
}

/**
 * Reversible production gate for the first V3 route cutover.
 *
 * Public web never enters this gate. A disabled rollout, an initial rollout
 * read failure with no cached authority, or an unsafe route returns the
 * existing route unchanged. Once an installed-app V3 route is selected, a
 * canonical bundle read failure remains in V3 as an explicit fail-closed
 * reconciliation state instead of silently presenting legacy UI as though
 * nothing failed. A later refetch failure with cached authoritative rollout or
 * bundle data likewise keeps that V3 state mounted rather than switching data
 * paths underneath the viewer. Participate remains signed-in-only for this
 * slice so anonymous public-voting parity stays on the proven legacy route
 * until its V3 projection is ready.
 *
 * The canonical router pathname owns which primary V3 surface is rendered. This
 * keeps content and shell navigation in lockstep even if TanStack Router retains
 * the previous route component for part of a client-side transition. While such
 * a retained transition is known to be in progress, fail-closed states render a
 * route-specific neutral surface instead of the stale route's legacy page.
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
  const effectiveSurface = resolveV3PrimarySurface(surface, pathname);
  const routeTransitionRetained = effectiveSurface !== surface;
  const rollout = useV3RolloutProbe(platformResolved && isAppMode);
  const shouldLoadBundle = shouldLoadV3PrimaryBundle({
    isAppMode: platformResolved && isAppMode,
    surface: effectiveSurface,
    rolloutEnabled: rollout.data?.enabled === true,
    rolloutUserId: rollout.data?.userId ?? null,
  });
  const bundleQuery = useV3PrimarySurfaceBundle(
    shouldLoadBundle,
    rollout.data?.editionId,
    rollout.data?.userId,
  );

  // SSR and the first hydration-safe client pass cannot know whether this is an
  // installed app. Keep that pass query-free so an installed client cannot start
  // the legacy data graph before choosing V3, but still return crawlable,
  // route-specific public content instead of a generic loading document.
  if (!platformResolved) return <ResolvingPrimarySurface surface={effectiveSurface} />;
  if (!isAppMode) return <>{legacy}</>;

  const safeLegacyFallback = routeTransitionRetained ? (
    <ResolvingPrimarySurface surface={effectiveSurface} />
  ) : (
    <>{legacy}</>
  );

  if (rollout.isLoading && !rollout.data) {
    return <ResolvingPrimarySurface surface={effectiveSurface} />;
  }
  if (!rollout.data || rollout.data.enabled !== true) return safeLegacyFallback;
  if (effectiveSurface === "participate" && !rollout.data.userId) return safeLegacyFallback;
  if (bundleQuery.isLoading && !bundleQuery.data) {
    return <ResolvingPrimarySurface surface={effectiveSurface} />;
  }
  if (!bundleQuery.data) {
    return (
      <V3PrimarySurfaceReadError
        surface={effectiveSurface}
        retrying={bundleQuery.isFetching}
        onRetry={() => void bundleQuery.refetch()}
      />
    );
  }

  const bundle = bundleQuery.data;
  const isAuthenticated = Boolean(bundle.bootstrap.identity.userId);
  if (effectiveSurface === "participate" && !isAuthenticated) return safeLegacyFallback;

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

  if (!shell.useV3Shell) return safeLegacyFallback;

  return (
    <V3AppShell
      editionLabel={bundle.shell.editionLabel}
      phaseLabel={bundle.shell.phaseLabel}
      participateAttentionCount={bundle.shell.participateAttentionCount}
    >
      {effectiveSurface === "home" ? (
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
