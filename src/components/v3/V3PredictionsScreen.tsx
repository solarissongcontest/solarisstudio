import { Link } from "@tanstack/react-router";
import { BarChart3, CheckCircle2, Clock3, LockKeyhole, Sparkles, Trophy } from "lucide-react";

import { editionLabel, useAllShows, useEditions } from "@/lib/data";
import {
  useFanProfile,
  useFanSession,
  useMyPredictionHistory,
  usePredictionRounds,
} from "@/lib/prediction-data";
import { formatEventDateTime } from "@/lib/public-time";
import { projectPredictionRounds, type V3PredictionRoundProjection, type V3PredictionState } from "@/lib/v3-predictions";
import {
  useV3PredictionLeagueEnabled,
  useV3PredictionLeagueStandings,
} from "@/lib/v3-predictions-runtime";
import {
  V3Screen,
  V3ScreenHeader,
  V3Section,
  V3StatusChip,
  V3Surface,
  type V3StatusTone,
} from "./V3Foundation";

function stateLabel(state: V3PredictionState) {
  switch (state) {
    case "upcoming": return "Upcoming";
    case "open": return "Open";
    case "submitted": return "Submitted";
    case "locked": return "Locked";
    case "scoring": return "Scoring";
    case "scored": return "Scored";
  }
}

function stateTone(state: V3PredictionState): V3StatusTone {
  if (state === "open") return "required";
  if (state === "submitted") return "success";
  if (state === "scoring") return "progress";
  if (state === "scored") return "success";
  if (state === "locked") return "locked";
  return "neutral";
}

function stateIcon(state: V3PredictionState) {
  if (state === "open") return Sparkles;
  if (state === "submitted" || state === "scored") return CheckCircle2;
  if (state === "locked") return LockKeyhole;
  if (state === "scoring") return BarChart3;
  return Clock3;
}

function breakdownEntries(
  round: V3PredictionRoundProjection,
): Array<readonly [string, string | number]> {
  const breakdown = round.breakdown;
  if (!breakdown) return [];

  const entries: Array<readonly [string, string | number]> = [];
  for (const [key, value] of Object.entries(breakdown)) {
    if (typeof value === "number" || typeof value === "string") {
      entries.push([key, value] as const);
    }
  }
  return entries.slice(0, 8);
}

export function V3PredictionsScreen() {
  const session = useFanSession();
  const viewerId = session.data?.id ?? null;
  const rounds = usePredictionRounds();
  const history = useMyPredictionHistory(viewerId ?? undefined);
  const profile = useFanProfile(viewerId ?? undefined);
  const shows = useAllShows();
  const editions = useEditions();
  const leagueFeature = useV3PredictionLeagueEnabled(true);
  const standings = useV3PredictionLeagueStandings(leagueFeature.data === true);

  const projected = projectPredictionRounds(rounds.data?.rounds ?? [], history.data ?? []);
  const showMap = new Map((shows.data ?? []).map((show) => [show.id, show] as const));
  const editionMap = new Map((editions.data ?? []).map((edition) => [edition.id, edition] as const));
  const active = projected.filter((round) => round.state !== "scored");
  const scored = projected.filter((round) => round.state === "scored").reverse();
  const myStanding = viewerId
    ? (standings.data ?? []).find((row) => row.profileId === viewerId) ?? null
    : null;

  const roundTitle = (round: V3PredictionRoundProjection) => {
    const show = showMap.get(round.showId);
    return show?.name ?? "Prediction round";
  };
  const roundEdition = (round: V3PredictionRoundProjection) => {
    const show = showMap.get(round.showId);
    const edition = show ? editionMap.get(show.edition_id) : null;
    return edition ? editionLabel(edition) : "Solaris Song Contest";
  };

  return (
    <V3Screen className="pb-8">
      <div data-v3-predictions-root="">
        <V3ScreenHeader
          kicker="Play"
          title="Predictions"
          description="Make private predictions, follow their scoring, and see the opt-in league without treating submission and standings as separate products."
        />

        {rounds.isLoading || session.isLoading ? (
          <V3Surface>
            <p role="status" aria-live="polite" className="text-sm text-[var(--v3-text-secondary)]">
              Loading prediction state…
            </p>
          </V3Surface>
        ) : rounds.isError ? (
          <V3Surface>
            <p role="alert" className="text-sm font-semibold">Prediction state could not be loaded.</p>
            <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
              Solaris will not infer whether a round is open or locked from cached browser state.
            </p>
          </V3Surface>
        ) : rounds.data?.schemaReady === false ? (
          <V3Surface>
            <div data-v3-predictions-state="unavailable">
              <p className="text-sm font-semibold">Predictions are temporarily unavailable</p>
              <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
                The prediction domain is unavailable. Existing contest pages remain usable and no local prediction state is substituted.
              </p>
            </div>
          </V3Surface>
        ) : (
          <>
            <V3Section title="Prediction rounds" meta={active.length ? `${active.length} current` : "No current round"}>
              {active.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {active.map((round) => {
                    const Icon = stateIcon(round.state);
                    return (
                      <Link key={round.id} to="/predictions/$showId" params={{ showId: round.showId }} className="block">
                        <V3Surface level={round.state === "open" ? "raised" : "base"} className="h-full p-4 transition hover:border-white/20">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-start gap-3">
                              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/[0.055] text-[var(--v3-text-secondary)]">
                                <Icon className="size-4" aria-hidden="true" />
                              </span>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-[var(--v3-text-tertiary)]">{roundEdition(round)}</p>
                                <p className="mt-1 truncate text-sm font-semibold">{roundTitle(round)}</p>
                              </div>
                            </div>
                            <V3StatusChip tone={stateTone(round.state)}>{stateLabel(round.state)}</V3StatusChip>
                          </div>
                          <div className="mt-4 border-t border-[var(--v3-border-subtle)] pt-3 text-xs leading-5 text-[var(--v3-text-secondary)]">
                            {round.state === "upcoming" ? (
                              <p>Opens {formatEventDateTime(round.opensAt)}</p>
                            ) : round.state === "open" || round.state === "submitted" ? (
                              <p>Locks {formatEventDateTime(round.locksAt)}</p>
                            ) : round.state === "scoring" ? (
                              <p>Official scoring is in progress.</p>
                            ) : (
                              <p>The saved prediction is read-only for this locked round.</p>
                            )}
                            <p className="mt-1">{round.predictionTypes.length} configured prediction type{round.predictionTypes.length === 1 ? "" : "s"}</p>
                          </div>
                        </V3Surface>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <V3Surface>
                  <div data-v3-predictions-state="empty">
                    <p className="text-sm font-semibold">No prediction round needs attention</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
                      A published round will appear here when the canonical prediction state makes it available.
                    </p>
                  </div>
                </V3Surface>
              )}
            </V3Section>

            <V3Section title="Your prediction history" meta={session.data ? `${history.data?.length ?? 0} saved` : "Sign in required"}>
              {!session.data ? (
                <V3Surface>
                  <p className="text-sm font-semibold">Sign in to keep prediction history</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
                    Your picks remain private by default and are attached to your authenticated fan account.
                  </p>
                  <a href="/auth?redirect=%2Fpredictions" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-[var(--v3-accent)] px-4 text-sm font-semibold text-black">
                    Sign in or create an account
                  </a>
                </V3Surface>
              ) : history.isLoading ? (
                <V3Surface><p role="status" className="text-sm text-[var(--v3-text-secondary)]">Loading your predictions…</p></V3Surface>
              ) : history.isError ? (
                <V3Surface><p role="alert" className="text-sm">Your prediction history could not be loaded.</p></V3Surface>
              ) : scored.length ? (
                <div className="grid gap-3">
                  {scored.slice(0, 12).map((round) => {
                    const details = breakdownEntries(round);
                    return (
                      <V3Surface key={round.id} level="raised" className="p-4">
                        <div data-v3-prediction-score="">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-xs font-semibold text-[var(--v3-text-tertiary)]">{roundEdition(round)}</p>
                              <p className="mt-1 text-sm font-semibold">{roundTitle(round)}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-bold tabular-nums">{round.score?.toFixed(1) ?? "–"} points</p>
                              {round.percentile != null ? <p className="text-xs text-[var(--v3-text-secondary)]">{round.percentile.toFixed(1)} percentile</p> : null}
                            </div>
                          </div>
                          <div className="mt-3 border-t border-[var(--v3-border-subtle)] pt-3">
                            <p className="text-xs text-[var(--v3-text-secondary)]">
                              Scoring basis · version <span className="font-semibold text-[var(--v3-text-primary)]">{round.scoringVersion}</span>
                            </p>
                            {details.length ? (
                              <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                                {details.map(([key, value]) => (
                                  <div key={key} className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.025] px-3 py-2 text-xs">
                                    <dt className="truncate text-[var(--v3-text-secondary)]">{key.replace(/_/g, " ")}</dt>
                                    <dd className="font-semibold tabular-nums">{String(value)}</dd>
                                  </div>
                                ))}
                              </dl>
                            ) : (
                              <p className="mt-2 text-xs leading-5 text-[var(--v3-text-tertiary)]">
                                This historical score is version-bound, but no public itemized breakdown is available in the current score projection.
                              </p>
                            )}
                          </div>
                        </div>
                      </V3Surface>
                    );
                  })}
                </div>
              ) : (
                <V3Surface>
                  <p className="text-sm font-semibold">No scored predictions yet</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
                    Submitted predictions move here after authoritative results are scored.
                  </p>
                </V3Surface>
              )}
            </V3Section>

            <V3Section title="Prediction League" meta={leagueFeature.data === true ? "Opt-in public standings" : "Unavailable"}>
              {leagueFeature.isLoading ? (
                <V3Surface><p role="status" className="text-sm text-[var(--v3-text-secondary)]">Checking league availability…</p></V3Surface>
              ) : leagueFeature.isError || leagueFeature.data !== true ? (
                <V3Surface>
                  <div data-v3-prediction-league-state="unavailable">
                    <p className="text-sm font-semibold">Prediction League is not available</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">Prediction submission remains separate from league rollout and continues to use the canonical round state.</p>
                  </div>
                </V3Surface>
              ) : standings.isLoading ? (
                <V3Surface><p role="status" className="text-sm text-[var(--v3-text-secondary)]">Loading standings…</p></V3Surface>
              ) : standings.isError ? (
                <V3Surface><p role="alert" className="text-sm">The public standings could not be loaded.</p></V3Surface>
              ) : (
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
                  <V3Surface level="raised" className="p-2">
                    {(standings.data ?? []).length ? (
                      <ol className="divide-y divide-[var(--v3-border-subtle)]" aria-label="Prediction League standings">
                        {(standings.data ?? []).slice(0, 10).map((row) => (
                          <li key={row.profileId} className="grid min-h-12 grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 px-2 py-2 text-sm">
                            <span className="text-center font-semibold tabular-nums text-[var(--v3-text-secondary)]">{row.position}</span>
                            <span className="truncate font-semibold">{row.displayName}</span>
                            <span className="text-right font-semibold tabular-nums">{row.score.toFixed(1)} <span className="font-normal text-[var(--v3-text-tertiary)]">· {row.rounds} rounds</span></span>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="p-3 text-sm text-[var(--v3-text-secondary)]">No public scored league entries are available yet.</p>
                    )}
                  </V3Surface>
                  <V3Surface>
                    <div className="flex items-start gap-3">
                      <Trophy className="mt-0.5 size-5 shrink-0 text-[var(--v3-text-secondary)]" aria-hidden="true" />
                      <div>
                        <p className="text-sm font-semibold">Your public position</p>
                        {myStanding ? (
                          <p className="mt-2 text-2xl font-bold tabular-nums">#{myStanding.position}</p>
                        ) : (
                          <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
                            {session.data && profile.data?.leaderboard_opt_in !== true
                              ? "Your fan profile is not opted into public standings. Your scores remain private."
                              : "No public scored position is available for this account yet."}
                          </p>
                        )}
                        <p className="mt-3 text-xs leading-5 text-[var(--v3-text-tertiary)]">
                          Total points determine position. More scored rounds are the first tie-break in the current canonical league contract. Historical prediction scores retain their scoring version.
                        </p>
                      </div>
                    </div>
                  </V3Surface>
                </div>
              )}
            </V3Section>
          </>
        )}
      </div>
    </V3Screen>
  );
}
