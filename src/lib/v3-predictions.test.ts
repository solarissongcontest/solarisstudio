import { describe, expect, it } from "vitest";

import type { PredictionRound, SavedPredictionEntry } from "./prediction-data";
import { predictionState, projectPredictionRound } from "./v3-predictions";

function round(status: PredictionRound["status"]): PredictionRound {
  return {
    id: "round-1",
    show_id: "show-1",
    opens_at: "2026-10-01T10:00:00Z",
    locks_at: "2026-10-02T10:00:00Z",
    status,
    prediction_types: ["winner"],
    scoring_version: "v7",
    consensus_minimum: 5,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
  };
}

function entry(state: SavedPredictionEntry["state"], scored = false): SavedPredictionEntry {
  return {
    id: "entry-1",
    round_id: "round-1",
    profile_id: "viewer-1",
    version: 2,
    state,
    submitted_at: "2026-10-01T12:00:00Z",
    locked_at: state === "locked" || state === "scored" ? "2026-10-02T10:00:00Z" : null,
    share_token: null,
    created_at: "2026-10-01T12:00:00Z",
    updated_at: "2026-10-01T12:00:00Z",
    prediction_items: [{ country_id: "country-1", prediction_type: "winner", rank: null, confidence: null }],
    prediction_score: scored
      ? {
          entry_id: "entry-1",
          score: 82.5,
          percentile: 91.2,
          breakdown: { winner: 50, placement: 32.5 },
          scoring_version: "v6",
          scored_at: "2026-10-03T10:00:00Z",
        }
      : null,
  };
}

describe("V3 Predictions projection", () => {
  it("maps canonical round and entry states without consulting browser time", () => {
    expect(predictionState(round("draft"))).toBe("upcoming");
    expect(predictionState(round("open"))).toBe("open");
    expect(predictionState(round("open"), entry("submitted"))).toBe("submitted");
    expect(predictionState(round("locked"), entry("locked"))).toBe("locked");
    expect(predictionState(round("scoring"), entry("locked"))).toBe("scoring");
    expect(predictionState(round("scored"), entry("scored", true))).toBe("scored");
    expect(predictionState(round("cancelled"))).toBeNull();
  });

  it("uses the immutable score's scoring version once scored", () => {
    const projected = projectPredictionRound(round("scored"), entry("scored", true));
    expect(projected?.scoringVersion).toBe("v6");
    expect(projected?.score).toBe(82.5);
    expect(projected?.percentile).toBe(91.2);
    expect(projected?.breakdown).toEqual({ winner: 50, placement: 32.5 });
  });

  it("does not invent the spec's archived state when no canonical archived state exists", () => {
    expect(projectPredictionRound(round("scored"), entry("scored", true))?.state).toBe("scored");
  });
});
