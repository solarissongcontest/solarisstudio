import type { ReactNode } from "react";
import { useState } from "react";
import { Eye } from "lucide-react";

import { V3AppShell } from "@/components/v3/V3AppShell";
import { V3Screen, V3ScreenHeader, V3StatusChip, V3Surface } from "@/components/v3/V3Foundation";
import { useAppExperiencePreferences } from "@/lib/app-experience";
import { useNotificationPreferences } from "@/lib/engagement-data";
import { useV3BroadcastIntelligenceBundle } from "@/lib/v3-broadcast-intelligence-runtime";
import { resolveV3ResultsAnalysisReveal } from "@/lib/v3-results-analysis-reveal";
import { resolveV3ResultsSpoilerProtection } from "@/lib/v3-results";
import {
  useV3EditionRolloutProbe,
  useV3RolloutProbe,
} from "@/lib/v3-primary-runtime";
import { V3BroadcastIntelligenceScreen } from "./V3BroadcastIntelligenceScreen";

export function V3BroadcastIntelligenceGate({
  fallback,
}: {
  fallback: ReactNode;
}) {
  const [selectedShowId, setSelectedShowId] = useState<string | null>(null);
  const [revealedResultKey, setRevealedResultKey] = useState<string | null>(null);
  const { preferences } = useAppExperiencePreferences();
  const bundle = useV3BroadcastIntelligenceBundle(selectedShowId, true);
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

  if (bundle.isLoading || (bundle.isSuccess && rollout.isLoading)) {
    return (
      <V3AppShell
        editionLabel={bundle.data?.shell.editionLabel ?? "Solaris Studio"}
        phaseLabel="Broadcast Intelligence"
        activeArea="results"
      >
        <V3Screen>
          <V3Surface className="p-5">
            <h1 className="text-2xl font-bold">Replay the voting</h1>
            <p
              role="status"
              className="mt-2 text-sm text-[var(--v3-text-secondary)]"
            >
              Preparing the published result replay…
            </p>
          </V3Surface>
        </V3Screen>
      </V3AppShell>
    );
  }

  if (bundle.isError || !bundle.data || rollout.isError || !rollout.data) {
    return <>{fallback}</>;
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
  const spoilerGate = resolveV3ResultsAnalysisReveal({
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
        <V3Screen>
          <V3ScreenHeader
            kicker="Broadcast Intelligence"
            title="Replay the voting"
            description="Explore an officially published voting replay without spoiling the result."
            editorial
          />
          <V3Surface level="raised" className="p-5" data-v3-broadcast-spoiler-protected="">
            <V3StatusChip tone="warning">Spoiler-free</V3StatusChip>
            <h2 className="mt-4 text-xl font-bold tracking-[-0.03em]">
              Voting replay spoilers are hidden
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
              This replay can reveal placements, points and the winner.
              Open it explicitly when you are ready to see this result.
            </p>
            <button
              type="button"
              onClick={() => setRevealedResultKey(spoilerGate.revealKey)}
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--v3-accent)] px-4 text-sm font-semibold text-[var(--v3-bg-base)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
            >
              <Eye className="size-4" aria-hidden="true" />
              Reveal this replay
            </button>
            <p className="mt-3 text-xs leading-5 text-white/42">
              Revealing does not change your spoiler-free preference.
            </p>
          </V3Surface>
        </V3Screen>
      ) : (
        <V3BroadcastIntelligenceScreen
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
