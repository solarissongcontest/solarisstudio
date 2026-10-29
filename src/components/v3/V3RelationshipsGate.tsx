import { V3ResultReadUnavailable } from "./V3ResultReadUnavailable";
import { V3ResultCoverageNotice } from "./V3ResultCoverageNotice";
import type { ReactNode } from "react";

import { V3AppShell } from "@/components/v3/V3AppShell";
import { V3Screen, V3Surface } from "@/components/v3/V3Foundation";
import { useV3EditionRolloutProbe, useV3RolloutProbe } from "@/lib/v3-primary-runtime";
import {
  useV3RelationshipDetailBundle,
  useV3RelationshipsIndexBundle,
} from "@/lib/v3-relationships-runtime";
import { V3RelationshipDetailScreen } from "./V3RelationshipDetailScreen";
import { V3RelationshipsIndexScreen } from "./V3RelationshipsIndexScreen";

function V3RelationshipsLoading({ editionLabel }: { editionLabel?: string }) {
  return (
    <V3AppShell
      editionLabel={editionLabel ?? "Solaris Studio"}
      phaseLabel="Relationships"
      activeArea="results"
    >
      <V3Screen>
        <V3Surface className="p-5">
          <h1 className="text-2xl font-bold">Voting relationships</h1>
          <p role="status" className="mt-2 text-sm text-[var(--v3-text-secondary)]">
            Calculating published relationship history…
          </p>
        </V3Surface>
      </V3Screen>
    </V3AppShell>
  );
}

export function V3RelationshipsIndexGate({ fallback }: { fallback: ReactNode }) {
  const bundle = useV3RelationshipsIndexBundle(true);
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
    return <V3RelationshipsLoading editionLabel={bundle.data?.shell.editionLabel} />;
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
      <V3RelationshipsIndexScreen pairs={bundle.data.pairs} />
    </V3AppShell>
  );
}

export function V3RelationshipDetailGate({
  pair,
  fallback,
}: {
  pair: string;
  fallback: ReactNode;
}) {
  const bundle = useV3RelationshipDetailBundle(pair, true);
  const rolloutEditionSlug = bundle.data?.rolloutEditionSlug ?? "";
  const editionProbe = useV3EditionRolloutProbe(
    rolloutEditionSlug,
    bundle.isSuccess && Boolean(rolloutEditionSlug),
  );
  const currentProbe = useV3RolloutProbe(
    bundle.isSuccess && !rolloutEditionSlug,
  );
  const rollout = rolloutEditionSlug ? editionProbe : currentProbe;

  if (bundle.isLoading || (bundle.isSuccess && bundle.data && rollout.isLoading)) {
    return <V3RelationshipsLoading editionLabel={bundle.data?.shell.editionLabel} />;
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
      <V3RelationshipDetailScreen bundle={bundle.data} />
    </V3AppShell>
  );
}
