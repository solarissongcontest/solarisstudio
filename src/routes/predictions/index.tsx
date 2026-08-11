import { createFileRoute, Link } from "@tanstack/react-router";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { editionLabel, useAllShows, useEditions } from "@/lib/data";
import { usePredictionRounds } from "@/lib/prediction-data";

export const Route = createFileRoute("/predictions/")({
  head: () => ({
    meta: [{ title: "Prediction Arena — Solaris Studio" }],
  }),
  component: PredictionArenaPage,
});

function PredictionArenaPage() {
  const { data: roundData, isLoading } = usePredictionRounds();
  const { data: shows } = useAllShows();
  const { data: editions } = useEditions();

  const showMap = new Map((shows ?? []).map((show) => [show.id, show]));
  const editionMap = new Map((editions ?? []).map((edition) => [edition.id, edition]));
  const rounds = roundData?.rounds ?? [];

  return (
    <AppShell>
      <PageHeader
        eyebrow="Predict before the show"
        title="Prediction Arena"
        description="Make your picks before the database-timed lock, then return after the result to see what you got right. Community consensus stays hidden until you submit."
      />

      {isLoading ? (
        <Panel>
          <p className="text-sm text-muted-foreground">Loading prediction rounds…</p>
        </Panel>
      ) : roundData?.schemaReady === false ? (
        <Panel title="Arena setup in progress">
          <p className="text-sm leading-relaxed text-muted-foreground">
            The Prediction Arena interface is ready. Its private prediction tables are still being
            applied, so no picks can be submitted yet.
          </p>
        </Panel>
      ) : rounds.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {rounds.map((round) => {
            const show = showMap.get(round.show_id);
            const edition = show ? editionMap.get(show.edition_id) : null;
            const locked = new Date(round.locks_at).getTime() <= Date.now();

            return (
              <Link
                key={round.id}
                to="/predictions/$showId"
                params={{ showId: round.show_id }}
                className="glass block p-4 transition-transform hover:-translate-y-0.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
                      {edition ? editionLabel(edition) : "Solaris Song Contest"}
                    </p>
                    <h2 className="mt-2 truncate font-display text-xl font-semibold">
                      {show?.name ?? "Prediction round"}
                    </h2>
                  </div>

                  <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-[10px] font-semibold uppercase text-muted-foreground">
                    {locked ? "Locked" : round.status}
                  </span>
                </div>

                <div className="mt-4 border-t border-border/60 pt-3">
                  <p className="text-xs text-muted-foreground">
                    {locked ? "Locked" : "Locks"}{" "}
                    <span className="font-semibold text-foreground">
                      {new Intl.DateTimeFormat(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(round.locks_at))}
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
