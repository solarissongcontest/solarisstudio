import type { ReactNode } from "react";

import { V3AppShell } from "@/components/v3/V3AppShell";
import { V3Screen, V3Surface } from "@/components/v3/V3Foundation";
import { useV3EditionRolloutProbe, useV3RolloutProbe } from "@/lib/v3-primary-runtime";
import { useV3RecordsBundle } from "@/lib/v3-records-runtime";
import { V3RecordsScreen } from "./V3RecordsScreen";

export function V3RecordsGate({ fallback }: { fallback: ReactNode }) {
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

  // Records is a derived Results surface. It adopts V3 only when canonical
  // Results rollout authority is resolved and enabled; every other state keeps
  // the established route available as a reversible fallback.
  if (bundle.isError || !bundle.data || rollout.isError || !rollout.data) {
    return <>{fallback}</>;
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
      <V3RecordsScreen
        records={bundle.data.records}
        archivedFinalEditions={bundle.data.archivedFinalEditions}
        generatedAt={bundle.data.generatedAt}
      />
    </V3AppShell>
  );
}
