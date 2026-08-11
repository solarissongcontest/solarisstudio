import { describe, expect, it } from "vitest";

import type { ResultRow } from "./data";
import { brierAccuracy, qualifierAccuracy, rankingAccuracy, scorePrediction } from "./predictions";

const row = (country: string, rank: number, jury: number, televote: number): ResultRow => ({
  id: country,
  edition_id: "e1",
  show_id: "s1",
  country_id: country,
  jury_points: jury,
  televote_points: televote,
  total_points: jury + televote,
  final_rank: rank,
});

describe("prediction scoring", () => {
  it("uses balanced precision and recall for qualifiers", () => {
    expect(qualifierAccuracy(["a", "b"], ["a", "c"])).toBe(50);
  });

  it("gives a perfect ranking 100 and penalizes reversed order", () => {
    expect(rankingAccuracy(["a", "b", "c"], ["a", "b", "c"])).toBe(100);
    expect(rankingAccuracy(["c", "b", "a"], ["a", "b", "c"])).toBe(0);
  });

  it("rewards calibrated confidence with a Brier score", () => {
    expect(
      brierAccuracy([
        { confidence: 1, happened: true },
        { confidence: 0, happened: false },
      ]),
    ).toBe(100);
  });

  it("scores winner, jury winner and televote winner reproducibly", () => {
    const results = [row("a", 1, 8, 12), row("b", 2, 12, 6)];
    const score = scorePrediction(
      [
        { type: "winner", countryId: "a" },
        { type: "jury_winner", countryId: "b" },
        { type: "televote_winner", countryId: "a" },
      ],
      results,
    );

    expect(score.total).toBe(100);
    expect(score.scoringVersion).toBe("v1");
  });

  it("scores ordered top-three predictions as a ranking component", () => {
    const results = [row("a", 1, 12, 8), row("b", 2, 8, 12), row("c", 3, 6, 6), row("d", 4, 4, 4)];
    const score = scorePrediction(
      [
        { type: "top_three", countryId: "a", rank: 1 },
        { type: "top_three", countryId: "b", rank: 2 },
        { type: "top_three", countryId: "c", rank: 3 },
      ],
      results,
    );

    expect(score.rankingScore).toBe(100);
    expect(score.total).toBe(100);
  });

  it("accepts a tied jury leader and evaluates ranked confidence by exact place", () => {
    const results = [row("a", 1, 12, 10), row("b", 2, 12, 8), row("c", 3, 4, 6)];
    const score = scorePrediction(
      [
        { type: "jury_winner", countryId: "b" },
        { type: "top_three", countryId: "b", rank: 1, confidence: 1 },
      ],
      results,
    );

    expect(score.headlineScore).toBe(100);
    expect(score.confidenceScore).toBe(0);
  });
});
