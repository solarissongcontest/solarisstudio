import { V3ResultReadUnavailable } from "./V3ResultReadUnavailable";
import { V3ResultCoverageNotice } from "./V3ResultCoverageNotice";
import { type ReactNode, useEffect, useState } from "react";

import { V3AppShell } from "@/components/v3/V3AppShell";
import { V3Screen, V3Surface } from "@/components/v3/V3Foundation";
import { useAppExperiencePreferences } from "@/lib/app-experience";
import { useNotificationPreferences } from "@/lib/engagement-data";
import { useV3EditionRolloutProbe, useV3RolloutProbe } from "@/lib/v3-primary-runtime";
import { useV3RecordsBundle } from "@/lib/v3-records-runtime";
import { resolveV3ResultsSpoilerProtection } from "@/lib/v3-results";
import { V3RecordsScreen } from "./V3RecordsScreen";

export function V3RecordsGate({ fallback }: { fallback: ReactNode }) {
  const { preferences } = useAppExperiencePreferences();
  const [currentEditionRevealed, setCurrentEditionRevealed] = useState(false);
  const bundle = useV3RecordsBundle(true);
  const rolloutEditionSlug = bundle.data?.rolloutEditionSlug ?? "";
  const editionProbe = useV3EditionRolloutProbe(
    rolloutEditionSlug,
    bundle.isSuccess && Boolean(rolloutEditionSlug),
  );
  const currentProbe = useV3RolloutProbe(
    bundle.isSuccess && !rolloutEditionSlug,
  );
  const rollout = rolloutEditionSlug ? editionProbe : currentProbe;
  const serverPreferences = useNotificationPreferences(rollout.data?.userId ?? undefined);

  useEffect(() => {
    setCurrentEditionRevealed(false);
  }, [bundle.data?.currentEditionId]);

  if (bundle.isLoading || (bundle.isSuccess && rollout.isLoading)) {
    return (
      <V3AppShell
        editionLabel={bundle.data?.shell.editionLabel ?? "Solaris Studio"}
        phaseLabel="Records"
        activeArea="results"
      >
        <V3Screen>
          <V3Surface className="p-5">
            <h1 className="text-2xl font-bold">Records</h1>
            <p role="status" className="mt-2 text-sm text-[var(--v3-text-secondary)]">
              Calculating records from the published archive…
            </p>
          </V3Surface>
        </V3Screen>
      </V3AppShell>
    );
  }

  // Canonical read failures must not select mutable legacy result truth.
  // Only an explicit server-disabled rollout permits the compatibility path.
  if (bundle.isError || !bundle.data || rollout.isError || !rollout.data) {
    return <V3ResultReadUnavailable />;
  }

  if (rollout.data.enabled !== true || rollout.data.resultsEnabled !== true) {
    return <>{fallback}</>;
  }

  const hideSpoilers = resolveV3ResultsSpoilerProtection({
    localSpoilerFree: preferences.spoilerFree,
    viewerResolved: true,
    viewerId: rollout.data.userId ?? null,
    serverPending: serverPreferences.isPending,
    serverError: serverPreferences.isError,
    serverSpoilerFree: serverPreferences.data?.spoiler_free ?? null,
  });
  const spoilerProtected =
    hideSpoilers &&
    !currentEditionRevealed &&
    bundle.data.currentEditionAffectsRecords;

  return (
    <V3AppShell
      editionLabel={bundle.data.shell.editionLabel}
      phaseLabel={bundle.data.shell.phaseLabel}
      activeArea="results"
    >
      <V3ResultCoverageNotice coverage={bundle.data.resultCoverage} />
      <V3RecordsScreen
        key={`${bundle.data.currentEditionId ?? "none"}:${spoilerProtected}`}
        records={spoilerProtected ? bundle.data.spoilerSafeRecords : bundle.data.records}
        archivedFinalEditions={
          spoilerProtected
            ? bundle.data.spoilerSafeArchivedFinalEditions
            : bundle.data.archivedFinalEditions
        }
        generatedAt={bundle.data.generatedAt}
        spoilerProtected={spoilerProtected}
        onRevealCurrentEdition={() => setCurrentEditionRevealed(true)}
      />
    </V3AppShell>
  );
}
