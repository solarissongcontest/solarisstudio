import type { PredictionRound, SavedPredictionEntry } from "./prediction-data";

export type V3PredictionState =
  | "upcoming"
  | "open"
  | "submitted"
  | "locked"
  | "scoring"
  | "scored";

export function resolveV3PredictionState(input: {
  round: PredictionRound;
  entry?: SavedPredictionEntry | null;
  nowMs: number;
}): V3PredictionState {
  const { round, entry, nowMs } = input;
  const opensAt = Date.parse(round.opens_at);
  const locksAt = Date.parse(round.locks_at);

  if (round.status === "scored" || entry?.prediction_score) return "scored";
  if (round.status === "scoring") return "scoring";
  if (round.status === "locked" || entry?.state === "locked" || nowMs >= locksAt) return "locked";
  if (nowMs < opensAt || round.status === "draft") return "upcoming";
  if (entry && (entry.state === "submitted" || entry.state === "draft")) return "submitted";
  return "open";
}

export function v3PredictionStateLabel(state: V3PredictionState) {
  if (state === "upcoming") return "Upcoming";
  if (state === "open") return "Open";
  if (state === "submitted") return "Submitted";
  if (state === "locked") return "Locked";
  if (state === "scoring") return "Scoring";
  return "Scored";
}

export function predictionCanEdit(state: V3PredictionState) {
  return state === "open" || state === "submitted";
}

export function predictionResultSummary(entry: SavedPredictionEntry | null | undefined) {
  if (!entry?.prediction_score) return null;
  return {
    score: entry.prediction_score.score,
    percentile: entry.prediction_score.percentile,
    scoringVersion: entry.prediction_score.scoring_version,
    breakdown: entry.prediction_score.breakdown,
  };
}

export function predictionTypeLabel(type: string) {
  if (type === "winner") return "Winner";
  if (type === "top_three") return "Top three";
  if (type === "top_ten") return "Top ten";
  if (type === "qualifier") return "Qualifiers";
  if (type === "jury_winner") return "Jury winner";
  if (type === "televote_winner") return "Televote winner";
  if (type === "full_ranking") return "Full ranking";
  return type.replaceAll("_", " ");
}
