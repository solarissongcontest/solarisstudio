import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppShell, Panel } from "@/components/AppShell";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { PredictionWorkspaceHeader } from "@/components/predictions/PredictionWorkspaceHeader";
import { V3AppShell } from "@/components/v3/V3AppShell";
import { V3PredictionsScreen } from "@/components/v3/V3PredictionsScreen";
import { editionLabel, useAllShows, useEditions } from "@/lib/data";
import { usePredictionRounds } from "@/lib/prediction-data";
import { formatEventDateTime } from "@/lib/public-time";
import { useV3RolloutProbe } from "@/lib/v3-primary-runtime";

export const Route = createFileRoute("/predictions/")({
  head: () => ({
    meta: [
      { title: "Predictions — Solaris Studio" },
      {
        name: "description",
        content: "Make Solaris predictions, follow scoring and view privacy-safe Prediction League standings.",
      },
    ],
  }),
  component: PredictionArenaPage,
});

function useHydratedNow() {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return now;
}

function PredictionArenaPage() {
  const { isAppMode, platformResolved } = useSolarisApp();
  const rollout = useV3RolloutProbe(platformResolved && isAppMode);

  if (!platformResolved || (isAppMode && rollout.isLoading)) {
    return (
      <main className="relative z-10 mx-auto w-full max-w-5xl px-4 py-10" data-v3-predictions-route-boot="">
        <h1 className="text-3xl font-bold">Predictions</h1>
        <p className="mt-2 text-sm text-muted-foreground" role="status" aria-live="polite">
          Checking the current predictions experience…
        </p>
      </main>
    );
  }

  if (isAppMode && !rollout.isError && rollout.data?.enabled === true) {
    return (
      <V3AppShell editionLabel="Solaris Studio" phaseLabel="Predictions" activeArea="explore">
        <V3PredictionsScreen />
      </V3AppShell>
    );
  }

  return <LegacyPredictionArenaPage />;
}

function LegacyPredictionArenaPage() {
  const { data: roundData, isLoading } = usePredictionRounds();
  const { data: shows } = useAllShows();
  const { data: editions } = useEditions();

  const showMap = new Map((shows ?? []).map((show) => [show.id, show]));
  const editionMap = new Map((editions ?? []).map((edition) => [edition.id, edition]));
  const rounds = roundData?.rounds ?? [];
  const now = useHydratedNow();

  return (
    <AppShell>
      <PredictionWorkspaceHeader
        active="arena"
        title="Prediction Arena"
        description="Make your picks before the round locks, then return after the result to see what you got right. Community consensus stays hidden until you submit."
      />

      {isLoading ? (
        <Panel>
          <p className="text-sm text-muted-foreground">Loading prediction rounds…</p>
        </Panel>
      ) : roundData?.schemaReady === false ? (
        <Panel title="Prediction Arena is temporarily unavailable">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Predictions cannot be submitted right now. Other public contest pages remain available.
          </p>
        </Panel>
      ) : rounds.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {rounds.map((round) => {
            const show = showMap.get(round.show_id);
            const edition = show ? editionMap.get(show.edition_id) : null;
            const locked = now != null && new Date(round.locks_at).getTime() <= now;

            return (
              <Link
                key={round.id}
                to="/predictions/$showId"
                params={{ showId: round.show_id }}
                className="group block rounded-2xl border border-border/70 bg-surface p-4 transition-colors hover:bg-surface-strong"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
                      {edition ? editionLabel(edition) : "Solaris Song Contest"}
                    </p>
                    <h2 className="mt-1.5 truncate text-lg font-bold tracking-[-.02em]">
                      {show?.name ?? "Prediction round"}
                    </h2>
                  </div>

                  <span className="shrink-0 rounded-full border border-border/70 bg-background/40 px-2.5 py-1 text-[10px] font-semibold uppercase text-muted-foreground">
                    {locked ? "Locked" : round.status}
                  </span>
                </div>

                <div className="mt-4 border-t border-border/60 pt-3">
                  <p className="text-xs text-muted-foreground">
                    {locked ? "Locked" : "Locks"}{" "}
                    <span className="font-semibold text-foreground">
                      {formatEventDateTime(round.locks_at)}
                    </span>
                  </p>
                  <p className="mt-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    {round.prediction_types.length} prediction type
                    {round.prediction_types.length === 1 ? "" : "s"}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <Panel title="No prediction round is open yet">
          <p className="text-sm leading-relaxed text-muted-foreground">
            The next show will appear here when its prediction window is published. There is no
            penalty for skipping a round and no streak to lose.
          </p>
        </Panel>
      )}
    </AppShell>
  );
}
