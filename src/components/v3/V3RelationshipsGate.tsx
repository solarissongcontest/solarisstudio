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

function V3RelationshipsLoading({
  editionLabel,
  unavailable = false,
  notFound = false,
  retrying = false,
  onRetry,
}: {
  editionLabel?: string;
  unavailable?: boolean;
  notFound?: boolean;
  retrying?: boolean;
  onRetry?: () => void;
}) {
  return (
    <V3AppShell
      editionLabel={editionLabel ?? "Solaris Studio"}
      phaseLabel="Relationships"
      activeArea="results"
    >
      <V3Screen>
        <V3Surface
          className="p-5"
          data-v3-relationships-authority-unavailable={unavailable ? "" : undefined}
        >
          <h1 className="text-2xl font-bold">Voting relationships</h1>
          <p role="status" className="mt-2 text-sm text-[var(--v3-text-secondary)]">
            {notFound
              ? "No published relationship matches this country pair. Check the country codes or choose a pair from the relationship directory."
              : unavailable
                ? "Published voting relationships cannot be verified. No analysis is shown until the official service is reachable."
                : "Calculating published relationship history…"}
          </p>
          {notFound ? (
            <a href="/relationships" className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70">
              Browse voting relationships
            </a>
          ) : null}
          {unavailable && onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              disabled={retrying}
              className="mt-4 min-h-11 rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 disabled:opacity-50"
            >
              {retrying ? "Retrying relationships…" : "Retry published relationships"}
            </button>
          ) : null}
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

  const loading = bundle.isLoading || (bundle.isSuccess && rollout.isLoading);
  const unavailable = bundle.isError || !bundle.data || rollout.isError || !rollout.data;
  if (loading || unavailable) {
    return (
      <V3RelationshipsLoading
        editionLabel={bundle.data?.shell.editionLabel}
        unavailable={!loading}
        retrying={bundle.isFetching || rollout.isFetching}
        onRetry={() => {
          if (bundle.isError || !bundle.data) void bundle.refetch();
          else void rollout.refetch();
        }}
      />
    );
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

  // A successful pair lookup can legitimately return null (unknown country
  // code or identical countries). Do not misclassify that as a service outage.
  if (bundle.isSuccess && bundle.data === null) {
    return <V3RelationshipsLoading notFound />;
  }

  const loading = bundle.isLoading || (bundle.isSuccess && rollout.isLoading);
  const unavailable = bundle.isError || !bundle.data || rollout.isError || !rollout.data;
  if (loading || unavailable) {
    return (
      <V3RelationshipsLoading
        editionLabel={bundle.data?.shell.editionLabel}
        unavailable={!loading}
        retrying={bundle.isFetching || rollout.isFetching}
        onRetry={() => {
          if (bundle.isError || !bundle.data) void bundle.refetch();
          else void rollout.refetch();
        }}
      />
    );
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
      <V3RelationshipDetailScreen bundle={bundle.data} />
    </V3AppShell>
  );
}
