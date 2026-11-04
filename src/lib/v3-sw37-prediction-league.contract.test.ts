import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  projectPersonalScoredPredictionRounds,
  type V3PredictionRoundProjection,
} from "./v3-predictions";

const hub = () => readFileSync("src/components/v3/V3PredictionsScreen.tsx", "utf8");
const adapter = () => readFileSync("src/lib/prediction-league-data.ts", "utf8");

describe("V3 Prediction League edition scope and private history", () => {
  it("offers all published editions, passing the chosen edition to the existing scoped adapter", () => {
    expect(hub()).toContain("edition.published");
    expect(hub()).toContain('<option value="all">All scored editions</option>');
    expect(hub()).toContain('value={leagueEditionId}');
    expect(hub()).toContain('leagueEditionId === "all" ? null : leagueEditionId');
    expect(adapter()).toContain("_edition_id: editionId");
    expect(hub()).not.toContain('rpc("prediction_league_leaderboard"');
  });

  it("only includes this viewer's scored submissions, including legitimate zero scores", () => {
    const saved: V3PredictionRoundProjection = {
      id: "round-1", showId: "show-1", state: "scored",
      opensAt: "2026-10-01T10:00:00Z", locksAt: "2026-10-02T10:00:00Z",
      predictionTypes: ["winner"], scoringVersion: "v1",
      savedEntryId: "entry-1", score: 0, percentile: null,
      scoredAt: "2026-10-03T00:00:00Z", breakdown: null,
    };
    const unsaved = { ...saved, id: "round-2", savedEntryId: null };
    const missingScore = { ...saved, id: "round-3", score: null };
    expect(projectPersonalScoredPredictionRounds([unsaved, missingScore, saved])).toEqual([saved]);
    expect(hub()).toContain("projectPersonalScoredPredictionRounds(projected)");
  });
});
