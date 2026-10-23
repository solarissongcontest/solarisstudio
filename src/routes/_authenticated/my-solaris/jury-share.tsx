import { createFileRoute, Link } from "@tanstack/react-router";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { V3AppShell } from "@/components/v3/V3AppShell";
import { V3OwnerJuryShareComposer } from "@/components/v3/V3OwnerJuryShareComposer";
import { V3Screen, V3ScreenHeader, V3Surface } from "@/components/v3/V3Foundation";
import { useV3RolloutProbe } from "@/lib/v3-primary-runtime";

export const Route = createFileRoute("/_authenticated/my-solaris/jury-share")({
  validateSearch: (search: Record<string, unknown>) => ({
    showId: typeof search.showId === "string" ? search.showId : "",
    countryId: typeof search.countryId === "string" ? search.countryId : "",
  }),
  head: () => ({
    meta: [
      { title: "Jury vote — Solaris Studio" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: OwnerJuryShareRoute,
});

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function V3OwnerJurySharePage({ showId, countryId }: { showId: string; countryId: string }) {
  const validIdentity = isUuid(showId) && isUuid(countryId);
  return (
    <V3Screen className="pb-8">
      <V3ScreenHeader
        kicker="Me"
        title="Share jury votes"
        description="Create an official Solaris Story graphic from a jury ballot that the canonical System projection allows this authenticated account to access."
      />

      <div className="mb-4">
        <Link
          to="/my-solaris/activity"
          className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--v3-text-secondary)]"
        >
          ← Back to Activity
        </Link>
      </div>

      {validIdentity ? (
        <V3OwnerJuryShareComposer showId={showId} countryId={countryId} />
      ) : (
        <V3Surface className="p-5">
          <h2 className="font-semibold">Open this from your Jury history</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--v3-text-secondary)]">
            This private tool needs the exact Show and Country identities supplied by a canonical Me/Activity or History item. Solaris does not infer ballot identity from names, browser history, or the current delegation.
          </p>
        </V3Surface>
      )}
    </V3Screen>
  );
}

function LegacyOwnerJurySharePage({ showId, countryId }: { showId: string; countryId: string }) {
  const validIdentity = isUuid(showId) && isUuid(countryId);
  return (
    <AppShell>
      <PageHeader
        eyebrow="MySolaris"
        title="Share jury votes"
        description="Create an official Solaris graphic from a jury ballot available to your signed-in account."
        actions={
          <Link
            to="/my-solaris/activity"
            className="inline-flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-semibold"
          >
            Back to Activity
          </Link>
        }
      />
      {validIdentity ? (
        <V3OwnerJuryShareComposer showId={showId} countryId={countryId} />
      ) : (
        <Panel title="Open a recorded jury ballot">
          <p className="text-sm leading-6 text-muted-foreground">
            This tool needs exact Show and Country identities from your own Solaris participation history. It does not guess them from your current account context.
          </p>
        </Panel>
      )}
    </AppShell>
  );
}

function OwnerJuryShareRoute() {
  const { showId, countryId } = Route.useSearch();
  const { isAppMode, platformResolved } = useSolarisApp();
  const rollout = useV3RolloutProbe(platformResolved && isAppMode);

  if (!platformResolved || (isAppMode && rollout.isLoading)) {
    return (
      <p className="px-4 py-10 text-sm text-muted-foreground" role="status" aria-live="polite">
        Opening jury vote…
      </p>
    );
  }

  if (
    isAppMode &&
    !rollout.isError &&
    rollout.data?.enabled === true &&
    rollout.data.meEnabled === true
  ) {
    return (
      <V3AppShell editionLabel="Solaris Studio" phaseLabel="Jury share" activeArea="me">
        <V3OwnerJurySharePage showId={showId} countryId={countryId} />
      </V3AppShell>
    );
  }

  return <LegacyOwnerJurySharePage showId={showId} countryId={countryId} />;
}
