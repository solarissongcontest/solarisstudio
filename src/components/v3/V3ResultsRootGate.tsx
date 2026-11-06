import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import { V3AppShell } from "@/components/v3/V3AppShell";
import { V3Screen, V3Surface } from "@/components/v3/V3Foundation";
import { V3ResultsScreen } from "@/components/v3/V3ResultsScreen";
import { useAppExperiencePreferences } from "@/lib/app-experience";
import { useMyCountryAccount } from "@/lib/country-account";
import { useNotificationPreferences } from "@/lib/engagement-data";
import { useV3EditionRolloutProbe, useV3RolloutProbe } from "@/lib/v3-primary-runtime";
import { resolveV3ResultsSpoilerProtection } from "@/lib/v3-results";
import { useV3ResultsBundle } from "@/lib/v3-results-runtime";

export function V3ResultsRootGate({ fallback }: { fallback: ReactNode }) {
  const { preferences } = useAppExperiencePreferences();
  const [selectedShowId, setSelectedShowId] = useState<string | null>(null);
  const bundle = useV3ResultsBundle(selectedShowId, true);
  const countryAccount = useMyCountryAccount();
  const editionSlug = bundle.data?.editionSlug ?? "";
  const editionProbe = useV3EditionRolloutProbe(
    editionSlug,
    bundle.isSuccess && Boolean(editionSlug),
  );
  const currentProbe = useV3RolloutProbe(
    bundle.isSuccess && !editionSlug,
  );
  const rollout = editionSlug ? editionProbe : currentProbe;
  const serverPreferences = useNotificationPreferences(rollout.data?.userId ?? undefined);

  const countries = useMemo(
    () => new Map((bundle.data?.countries ?? []).map((country) => [country.id, country])),
    [bundle.data?.countries],
  );

  if (bundle.isLoading || (bundle.isSuccess && rollout.isLoading)) {
    return (
      <V3AppShell editionLabel="Solaris Studio" phaseLabel="Results" activeArea="results">
        <V3Screen>
          <V3Surface className="p-5">
            <h1 className="text-2xl font-bold">Results</h1>
            <p role="status" className="mt-2 text-sm text-[var(--v3-text-secondary)]">
              Opening published results…
            </p>
          </V3Surface>
        </V3Screen>
      </V3AppShell>
    );
  }

  // A failed publication snapshot is not permission to mount legacy archive
  // readers, which could present mutable/unverified Result rows. The reversible
  // legacy fallback is reserved for an explicitly server-disabled V3 rollout.
  if (bundle.isError || !bundle.data || rollout.isError || !rollout.data) {
    const retrying = bundle.isFetching || rollout.isFetching;
    return (
      <V3AppShell editionLabel="Solaris Studio" phaseLabel="Results" activeArea="results">
        <V3Screen>
          <V3Surface level="raised" className="p-5" data-v3-results-authority-unavailable="">
            <h1 className="text-2xl font-bold tracking-[-0.03em]">
              Official results temporarily unavailable
            </h1>
            <p role="status" className="mt-3 max-w-prose text-sm leading-6 text-[var(--v3-text-secondary)]">
              Solaris could not verify the current published result. No outcome
              is shown until the authoritative Results service can be reached.
            </p>
            <button
              type="button"
              disabled={retrying}
              onClick={() => {
                if (bundle.isError || !bundle.data) void bundle.refetch();
                else void rollout.refetch();
              }}
              className="mt-4 min-h-11 rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 disabled:opacity-50"
            >
              {retrying ? "Retrying results…" : "Retry official results"}
            </button>
          </V3Surface>
        </V3Screen>
      </V3AppShell>
    );
  }

  const v3Enabled = rollout.data.enabled === true && rollout.data.resultsEnabled === true;
  if (!v3Enabled) return <>{fallback}</>;

  const hideSpoilers = resolveV3ResultsSpoilerProtection({
    localSpoilerFree: preferences.spoilerFree,
    viewerResolved: true,
    viewerId: rollout.data.userId ?? null,
    serverPending: serverPreferences.isPending,
    serverError: serverPreferences.isError,
    serverSpoilerFree: serverPreferences.data?.spoiler_free ?? null,
  });

  const viewerCountryId =
    rollout.data.userId &&
    !countryAccount.isPending &&
    !countryAccount.isError &&
    countryAccount.data?.access.userId === rollout.data.userId
      ? countryAccount.data.access.countryId
      : null;

  return (
    <V3AppShell
      editionLabel={bundle.data.shell.editionLabel}
      phaseLabel={bundle.data.shell.phaseLabel ?? "Results"}
      activeArea="results"
    >
      <V3ResultsScreen
        key={`${rollout.data.userId ?? "anonymous"}:${bundle.data.input.showId || "none"}:${hideSpoilers}`}
        countries={countries}
        hideSpoilers={hideSpoilers}
        input={{
          ...bundle.data.input,
          userDelegationCountryId: viewerCountryId,
        }}
        options={bundle.data.options}
        changingResult={bundle.isFetching}
        onResultChange={setSelectedShowId}
      />
    </V3AppShell>
  );
}
