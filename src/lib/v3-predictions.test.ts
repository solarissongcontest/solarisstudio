import { describe, expect, it } from "vitest";

import type { PredictionRound, SavedPredictionEntry } from "./prediction-data";
import {
  predictionCanEdit,
  predictionResultSummary,
  resolveV3PredictionState,
} from "./v3-predictions";

const round = {
  id: "round-1",
  show_id: "show-1",
  opens_at: "2026-10-16T10:00:00Z",
  locks_at: "2026-10-17T10:00:00Z",
  status: "open",
  prediction_types: ["winner"],
  scoring_version: "v1",
  consensus_minimum: 5,
  created_at: "2026-10-16T00:00:00Z",
  updated_at: "2026-10-16T00:00:00Z",
} as PredictionRound;

function entry(overrides: Partial<SavedPredictionEntry> = {}): SavedPredictionEntry {
  return {
    id: "entry-1",
    round_id: round.id,
    profile_id: "viewer",
    version: 1,
    state: "submitted",
    submitted_at: "2026-10-16T12:00:00Z",
    locked_at: null,
    share_token: null,
    created_at: "2026-10-16T12:00:00Z",
    updated_at: "2026-10-16T12:00:00Z",
    prediction_items: [],
    prediction_score: null,
    ...overrides,
  } as SavedPredictionEntry;
}

describe("V3 Predictions lifecycle", () => {
  it("distinguishes open and submitted while revision is still allowed", () => {
    const now = Date.parse("2026-10-16T14:00:00Z");
    expect(resolveV3PredictionState({ round, entry: null, nowMs: now })).toBe("open");
    expect(resolveV3PredictionState({ round, entry: entry(), nowMs: now })).toBe("submitted");
    expect(predictionCanEdit("submitted")).toBe(true);
  });

  it("uses authoritative round/scoring evidence for locked, scoring and scored states", () => {
    expect(resolveV3PredictionState({ round, entry: entry(), nowMs: Date.parse("2026-10-18T10:00:00Z") })).toBe("locked");
    expect(resolveV3PredictionState({ round: { ...round, status: "scoring" }, entry: entry(), nowMs: Date.parse("2026-10-18T10:00:00Z") })).toBe("scoring");
    expect(resolveV3PredictionState({ round: { ...round, status: "scored" }, entry: entry(), nowMs: Date.parse("2026-10-18T10:00:00Z") })).toBe("scored");
  });

  it("preserves the scoring version and breakdown from the canonical score", () => {
    const saved = entry({
      prediction_score: {
        id: "score-1",
        entry_id: "entry-1",
        score: 82.5,
        percentile: 91,
        breakdown: { winner: 25, qualifiers: 57.5 },
        scoring_version: "v1",
        scored_at: "2026-10-18T10:00:00Z",
      },
    });
    expect(predictionResultSummary(saved)).toEqual({
      score: 82.5,
      percentile: 91,
      scoringVersion: "v1",
      breakdown: { winner: 25, qualifiers: 57.5 },
    });
  });
});
