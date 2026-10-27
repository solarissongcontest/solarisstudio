import { V3ResultReadUnavailable } from "./V3ResultReadUnavailable";
import { V3ResultCoverageNotice } from "./V3ResultCoverageNotice";
import type { ReactNode } from "react";
import { useState } from "react";

import { V3AppShell } from "@/components/v3/V3AppShell";
import { V3Screen, V3Surface } from "@/components/v3/V3Foundation";
import { useV3BroadcastIntelligenceBundle } from "@/lib/v3-broadcast-intelligence-runtime";
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
    return <V3ResultReadUnavailable />;
  }

  if (rollout.data.enabled !== true || rollout.data.resultsEnabled !== true) {
    return <>{fallback}</>;
  }

  return (
    <V3AppShell
      editionLabel={bundle.data.shell.editionLabel}
      phaseLabel={bundle.data.shell.phaseLabel}
      activeArea="results"
    >
      <V3ResultCoverageNotice coverage={bundle.data.resultCoverage} />
      <V3BroadcastIntelligenceScreen
        bundle={bundle.data}
        onShowChange={setSelectedShowId}
        changingShow={bundle.isFetching}
      />
    </V3AppShell>
  );
}
