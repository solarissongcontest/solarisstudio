import { BarChart3, CheckCircle2, Clock3, LockKeyhole, Sparkles, Trophy } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { formatEventDateTime } from "@/lib/public-time";
import {
  predictionTypeLabel,
  v3PredictionStateLabel,
  type V3PredictionState,
} from "@/lib/v3-predictions";
import { V3Screen, V3ScreenHeader, V3Section, V3StatusChip, V3Surface } from "./V3Foundation";

export type V3PredictionRoundCard = {
  id: string;
  showId: string;
  title: string;
  editionLabel: string;
  locksAt: string;
  state: V3PredictionState;
  predictionTypes: readonly string[];
  score: number | null;
  percentile: number | null;
  scoringVersion: string | null;
};

function stateTone(state: V3PredictionState) {
  if (state === "open") return "required" as const;
  if (state === "submitted") return "success" as const;
  if (state === "scoring") return "live" as const;
  if (state === "scored") return "success" as const;
  if (state === "locked") return "locked" as const;
  return "neutral" as const;
}

function stateIcon(state: V3PredictionState) {
  if (state === "submitted" || state === "scored") return CheckCircle2;
  if (state === "locked") return LockKeyhole;
  if (state === "scoring") return BarChart3;
  return Clock3;
}

export function V3PredictionsScreen({
  rounds,
  signedIn,
}: {
  rounds: readonly V3PredictionRoundCard[];
  signedIn: boolean;
}) {
  return (
    <V3Screen className="pb-8">
      <div data-v3-predictions-root="">
        <V3ScreenHeader
          kicker="Play · Predictions"
          title="Predictions"
          description="Make private picks before a round locks, then follow the same prediction through scoring and the public opt-in League. One product, fewer conceptual hallways."
        />

        <V3Section
          title="Prediction rounds"
          meta={signedIn ? "Your private picks" : "Sign in to save picks"}
        >
          {rounds.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {rounds.map((round) => {
                const Icon = stateIcon(round.state);
                return (
                  <Link
                    key={round.id}
                    to="/predictions/$showId"
                    params={{ showId: round.showId }}
                    className="block"
                  >
                    <V3Surface level="raised" className="h-full p-4">
                      <article data-v3-prediction-round={round.id} data-v3-prediction-state={round.state}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-[var(--v3-text-tertiary)]">{round.editionLabel}</p>
                            <h2 className="mt-1 truncate font-semibold">{round.title}</h2>
                          </div>
                          <V3StatusChip tone={stateTone(round.state)}>{v3PredictionStateLabel(round.state)}</V3StatusChip>
                        </div>
                        <div className="mt-4 flex items-start gap-2 text-xs text-[var(--v3-text-secondary)]">
                          <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                          <span>{round.state === "scored" ? "Scored prediction" : `Locks ${formatEventDateTime(round.locksAt)}`}</span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {round.predictionTypes.map((type) => (
                            <span key={type} className="rounded-full border border-[var(--v3-border)] px-2 py-1 text-[10px] text-[var(--v3-text-tertiary)]">
                              {predictionTypeLabel(type)}
                            </span>
                          ))}
                        </div>
                        {round.score != null ? (
                          <div className="mt-4 border-t border-[var(--v3-border-subtle)] pt-3">
                            <p className="text-2xl font-black tabular-nums">{round.score.toFixed(1)}</p>
                            <p className="mt-1 text-xs text-[var(--v3-text-secondary)]">
                              points{round.percentile != null ? ` · ${round.percentile.toFixed(0)}th percentile` : ""}
                              {round.scoringVersion ? ` · ${round.scoringVersion}` : ""}
                            </p>
                          </div>
                        ) : null}
                      </article>
                    </V3Surface>
                  </Link>
                );
              })}
            </div>
          ) : (
            <V3Surface className="p-5" data-v3-predictions-state="empty">
              <p className="text-sm font-semibold">No prediction round is available yet</p>
              <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
                Published rounds appear here when the Organizer opens the prediction window. Skipping one does not create a penalty or fake streak debt.
              </p>
            </V3Surface>
          )}
        </V3Section>

        <V3Section title="Prediction League" meta="Public only if you opt in">
          <V3Surface level="raised" className="p-5">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/[0.055]">
                <Trophy className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold">Season standings</h2>
                <p className="mt-1 text-sm leading-6 text-[var(--v3-text-secondary)]">
                  The League is the scored public layer of these same predictions. Historical scores keep their stored scoring version instead of being silently recalculated under later rules.
                </p>
                <Link
                  to={"/prediction-league" as any}
                  className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--v3-border)] px-4 text-sm font-semibold"
                >
                  <Sparkles className="size-4" aria-hidden="true" /> Open Prediction League
                </Link>
              </div>
            </div>
          </V3Surface>
        </V3Section>
      </div>
    </V3Screen>
  );
}
