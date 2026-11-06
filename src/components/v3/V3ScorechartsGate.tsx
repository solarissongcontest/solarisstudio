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

  // Until publication/rollout can be verified, do not mount the legacy
  // archive-wide route just because the focused server read failed.
  // Legacy is still available when the server explicitly disables V3 Results.
  const loading = bundle.isLoading || (bundle.isSuccess && rollout.isLoading);
  const unavailable = bundle.isError || !bundle.data || rollout.isError || !rollout.data;
  if (loading || unavailable) {
    const retrying = bundle.isFetching || rollout.isFetching;
    return (
      <V3AppShell
        editionLabel={bundle.data?.shell.editionLabel ?? "Solaris Studio"}
        phaseLabel="Scorecharts"
        activeArea="results"
      >
        <V3Screen>
          <V3Surface
            level="raised"
            className="p-5"
            data-v3-scorecharts-authority-unavailable={!loading ? "" : undefined}
          >
            <h1 className="text-2xl font-bold">Full Scorecharts</h1>
            <p role="status" className="mt-2 text-sm text-[var(--v3-text-secondary)]">
              {loading
                ? "Opening published detailed voting…"
                : "Published scorechart availability could not be verified. No voting breakdown is shown until the official service is reachable."}
            </p>
            {!loading ? (
              <button
                type="button"
                disabled={retrying}
                onClick={() => {
                  if (bundle.isError || !bundle.data) void bundle.refetch();
                  else void rollout.refetch();
                }}
                className="mt-4 min-h-11 rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 disabled:opacity-50"
              >
                {retrying ? "Retrying scorecharts…" : "Retry official scorecharts"}
              </button>
            ) : null}
          </V3Surface>
        </V3Screen>
      </V3AppShell>
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
      <V3ScorechartsScreen
        items={bundle.data.items}
        generatedAt={bundle.data.generatedAt}
      />
    </V3AppShell>
  );
}
