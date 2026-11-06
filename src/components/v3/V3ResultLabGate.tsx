import type { ReactNode } from "react";
import { useState } from "react";
import { Eye } from "lucide-react";

import { V3AppShell } from "@/components/v3/V3AppShell";
import { V3Screen, V3ScreenHeader, V3StatusChip, V3Surface } from "@/components/v3/V3Foundation";
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

  if (bundle.isLoading || (bundle.isSuccess && rollout.isLoading)) {
    return (
      <V3AppShell
        editionLabel={bundle.data?.shell.editionLabel ?? "Solaris Studio"}
        phaseLabel="Result Lab"
        activeArea="results"
      >
        <V3Screen>
          <V3Surface className="p-5">
            <h1 className="text-2xl font-bold">Result Lab</h1>
            <p role="status" className="mt-2 text-sm text-[var(--v3-text-secondary)]">
              Loading official inputs for a new simulation…
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
        <V3Screen>
          <V3ScreenHeader
            kicker="What-if analytics"
            title="Result Lab"
            description="Explore hypothetical voting scenarios from officially published results."
            editorial
          />
          <V3Surface level="raised" className="p-5" data-v3-result-lab-spoiler-protected="">
            <V3StatusChip tone="warning">Spoiler-free</V3StatusChip>
            <h2 className="mt-4 text-xl font-bold tracking-[-0.03em]">
              Result Lab spoilers are hidden
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
              The simulation can reveal official placements and a hypothetical winner.
              Your spoiler-free preference is on, so nothing is shown until you choose to reveal this result.
            </p>
            <button
              type="button"
              onClick={() => setRevealedResultKey(spoilerGate.revealKey)}
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--v3-accent)] px-4 text-sm font-semibold text-[var(--v3-bg-base)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
            >
              <Eye className="size-4" aria-hidden="true" />
              Reveal this simulation
            </button>
            <p className="mt-3 text-xs leading-5 text-white/42">
              Revealing this result does not change your spoiler-free preference.
            </p>
          </V3Surface>
        </V3Screen>
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
