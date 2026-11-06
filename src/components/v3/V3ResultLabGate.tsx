import type { ReactNode } from "react";
import { useState } from "react";

import { V3AppShell } from "@/components/v3/V3AppShell";
import { useAppExperiencePreferences } from "@/lib/app-experience";
import { useNotificationPreferences } from "@/lib/engagement-data";
import {
  useV3EditionRolloutProbe,
  useV3RolloutProbe,
} from "@/lib/v3-primary-runtime";
import { useV3ResultLabBundle } from "@/lib/v3-result-lab-runtime";
import { resolveV3ResultsSpoilerProtection } from "@/lib/v3-results";
import { resolveV3ResultLabSpoilerGate } from "@/lib/v3-result-lab-spoilers";
import { V3ResultLabScreen } from "./V3ResultLabScreen";
import { V3AnalysisReadState, V3AnalysisRevealScreen } from "./V3AnalysisRevealScreen";

export function V3ResultLabGate({ fallback }: { fallback: ReactNode }) {
  const [selectedShowId, setSelectedShowId] = useState<string | null>(null);
  const [revealedResultKey, setRevealedResultKey] = useState<string | null>(null);
  const { preferences } = useAppExperiencePreferences();
  const bundle = useV3ResultLabBundle(selectedShowId, true);
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

  const loading = bundle.isLoading || (bundle.isSuccess && rollout.isLoading);
  const unavailable = bundle.isError || !bundle.data || rollout.isError || !rollout.data;
  if (loading || unavailable) {
    return (
      <V3AppShell
        editionLabel={bundle.data?.shell.editionLabel ?? "Solaris Studio"}
        phaseLabel="Result Lab"
        activeArea="results"
      >
        <V3AnalysisReadState
          title="Result Lab"
          loading={loading}
          retrying={bundle.isFetching || rollout.isFetching}
          onRetry={() => {
            if (bundle.isError || !bundle.data) void bundle.refetch();
            else void rollout.refetch();
          }}
        />
      </V3AppShell>
    );
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
  const spoilerGate = resolveV3ResultLabSpoilerGate({
    hideSpoilers,
    selectedShowId: bundle.data.selectedShowId,
    viewerId: rollout.data.userId ?? null,
    revealedResultKey,
  });

  return (
    <V3AppShell
      editionLabel={bundle.data.shell.editionLabel}
      phaseLabel={bundle.data.shell.phaseLabel}
      activeArea="results"
    >
      {spoilerGate.protected ? (
        <V3AnalysisRevealScreen
          replay={false}
          onReveal={() => setRevealedResultKey(spoilerGate.revealKey)}
        />
      ) : (
        <V3ResultLabScreen
          bundle={bundle.data}
          onShowChange={(showId) => {
            setRevealedResultKey(null);
            setSelectedShowId(showId);
          }}
          changingShow={bundle.isFetching}
        />
      )}
    </V3AppShell>
  );
}
