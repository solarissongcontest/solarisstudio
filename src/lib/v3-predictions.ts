import type { PredictionRound, SavedPredictionEntry } from "./prediction-data";

export type V3PredictionState =
  | "upcoming"
  | "open"
  | "submitted"
  | "locked"
  | "scoring"
  | "scored";

export type V3PredictionBreakdown = Record<string, string | number>;

export type V3PredictionRoundProjection = {
  id: string;
  showId: string;
  state: V3PredictionState;
  opensAt: string;
  locksAt: string;
  predictionTypes: readonly string[];
  scoringVersion: string;
  savedEntryId: string | null;
  score: number | null;
  percentile: number | null;
  scoredAt: string | null;
  breakdown: V3PredictionBreakdown | null;
};

export function predictionState(
  round: PredictionRound,
  entry?: SavedPredictionEntry | null,
): V3PredictionState | null {
  if (round.status === "cancelled") return null;
  if (round.status === "scored" || entry?.prediction_score) return "scored";
  if (round.status === "scoring") return "scoring";
  if (round.status === "locked") return "locked";
  if (round.status === "open") return entry ? "submitted" : "open";
  return "upcoming";
}

function projectBreakdown(value: unknown): V3PredictionBreakdown | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const result: V3PredictionBreakdown = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === "string" || typeof item === "number") {
      result[key] = item;
    }
  }

  return Object.keys(result).length ? result : null;
}

export function projectPredictionRound(
  round: PredictionRound,
  entry?: SavedPredictionEntry | null,
): V3PredictionRoundProjection | null {
  const state = predictionState(round, entry);
  if (!state) return null;
  const score = entry?.prediction_score ?? null;
  return {
    id: round.id,
    showId: round.show_id,
    state,
    opensAt: round.opens_at,
    locksAt: round.locks_at,
    predictionTypes: round.prediction_types,
    scoringVersion: score?.scoring_version ?? round.scoring_version,
    savedEntryId: entry?.id ?? null,
    score: score ? Number(score.score) : null,
    percentile: score?.percentile == null ? null : Number(score.percentile),
    scoredAt: score?.scored_at ?? null,
    breakdown: score ? projectBreakdown(score.breakdown) : null,
  };
}

export function projectPredictionRounds(
  rounds: readonly PredictionRound[],
  history: readonly SavedPredictionEntry[],
) {
  const entries = new Map(history.map((entry) => [entry.round_id, entry] as const));
  return rounds
    .map((round) => projectPredictionRound(round, entries.get(round.id)))
    .filter((round): round is V3PredictionRoundProjection => Boolean(round));
}
