import { V3ResultReadUnavailable } from "./V3ResultReadUnavailable";
import { V3ResultCoverageNotice } from "./V3ResultCoverageNotice";
import type { ReactNode } from "react";

import { V3AppShell } from "@/components/v3/V3AppShell";
import { V3Screen, V3Surface } from "@/components/v3/V3Foundation";
import { useV3EditionRolloutProbe, useV3RolloutProbe } from "@/lib/v3-primary-runtime";
import { useV3ScorechartsBundle } from "@/lib/v3-scorecharts-runtime";
import { V3ScorechartsScreen } from "./V3ScorechartsScreen";

export function V3ScorechartsGate({ fallback }: { fallback: ReactNode }) {
  const bundle = useV3ScorechartsBundle(true);
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
        phaseLabel="Scorecharts"
        activeArea="results"
      >
        <V3Screen>
          <V3Surface className="p-5">
            <h1 className="text-2xl font-bold">Full Scorecharts</h1>
            <p role="status" className="mt-2 text-sm text-[var(--v3-text-secondary)]">
              Opening published detailed voting…
            </p>
          </V3Surface>
        </V3Screen>
      </V3AppShell>
    );
  }

  // Failed canonical reads or unresolved rollout cannot authorize legacy
  // result truth. Preserve rollback only for a resolved disabled rollout.
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
      <V3ScorechartsScreen
        items={bundle.data.items}
        generatedAt={bundle.data.generatedAt}
      />
    </V3AppShell>
  );
}
