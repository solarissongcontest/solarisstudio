import { Link, useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { useSolarisApp } from "@/components/app/AppRuntime";
import { useV3EditionBundle } from "@/lib/v3-edition-runtime";
import { useV3RolloutProbe } from "@/lib/v3-primary-runtime";
import { decideV3ShellForRoute } from "@/lib/v3-shell-route-boundary";
import { V3AppShell } from "./V3AppShell";
import { V3EditionHubScreen } from "./V3EditionHubScreen";

const LEGACY_EDITION_SECTION_HASHES = new Set([
  "edition-overview",
  "edition-entries",
  "edition-results",
  "edition-stories",
  "edition-shows",
  "edition-countries",
]);

function normalizeHash(value: string) {
  const raw = value.replace(/^#/, "");
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function ResolvingEditionSurface() {
  return (
    <main
      className="relative z-10 mx-auto w-full max-w-3xl px-4 py-10 sm:py-14"
      data-v3-edition-boot=""
    >
      <header className="border-b border-border/70 pb-5">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-primary">
          Edition
        </p>
        <h1 className="mt-2 font-display text-3xl font-black tracking-[-0.04em] sm:text-5xl">
          Solaris edition
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Loading the public Edition hub.
        </p>
      </header>
      <nav
        className="mt-5 flex flex-wrap gap-x-5 gap-y-3 text-sm font-semibold"
        aria-label="Edition navigation while loading"
      >
        <Link to="/editions" className="text-primary hover:underline">
          All editions
        </Link>
        <Link to="/explore" className="text-primary hover:underline">
          Explore Solaris
        </Link>
      </nav>
      <p className="sr-only" role="status" aria-live="polite">
        Checking the current Edition experience.
      </p>
    </main>
  );
}

/**
 * Reversible installed-app cutover for the Edition hub. The clean Edition URL
 * may use V3, while public web and recognized deep-linked legacy sections keep
 * the existing detailed public renderer. Browser state can only opt into the
 * legacy fallback; it can never enable V3.
 */
export function V3EditionRouteGate({
  slug,
  legacy,
}: {
  slug: string;
  legacy: ReactNode;
}) {
  const { isAppMode, platformResolved } = useSolarisApp();
  const pathname = useLocation({ select: (location) => location.pathname });
  const searchStr = useLocation({ select: (location) => location.searchStr });
  const hash = useLocation({ select: (location) => location.hash });
  const legacyDetailRequested = LEGACY_EDITION_SECTION_HASHES.has(normalizeHash(hash));
  const rollout = useV3RolloutProbe(
    platformResolved && isAppMode && !legacyDetailRequested,
  );
  const shouldLoadBundle =
    platformResolved &&
    isAppMode &&
    !legacyDetailRequested &&
    rollout.data?.enabled === true &&
    rollout.data?.exploreEnabled === true &&
    rollout.data?.editionEnabled === true;
  const bundleQuery = useV3EditionBundle(slug, shouldLoadBundle);

  if (!platformResolved) return <ResolvingEditionSurface />;
  if (!isAppMode || legacyDetailRequested) return <>{legacy}</>;
  if (rollout.isLoading) return <ResolvingEditionSurface />;
  if (
    rollout.isError ||
    rollout.data?.enabled !== true ||
    rollout.data?.exploreEnabled !== true ||
    rollout.data?.editionEnabled !== true
  ) {
    return <>{legacy}</>;
  }
  if (bundleQuery.isLoading) return <ResolvingEditionSurface />;
  if (bundleQuery.isError || !bundleQuery.data?.projection) return <>{legacy}</>;

  const shell = decideV3ShellForRoute({
    pathname,
    search: searchStr,
    rolloutRule: { stage: "enabled" },
    rolloutContext: {
      userId: rollout.data.userId,
      editionId: bundleQuery.data.projection.hero.id,
      isOrganizer: false,
    },
    isAuthenticated: Boolean(rollout.data.userId),
  });
  if (!shell.useV3Shell) return <>{legacy}</>;

  return (
    <V3AppShell
      editionLabel={bundleQuery.data.shell.editionLabel}
      phaseLabel={bundleQuery.data.shell.phaseLabel}
      activeArea="explore"
    >
      <V3EditionHubScreen projection={bundleQuery.data.projection} />
    </V3AppShell>
  );
}

export { LEGACY_EDITION_SECTION_HASHES };
