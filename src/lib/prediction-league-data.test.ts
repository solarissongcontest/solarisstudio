import { describe, expect, it } from "vitest";
import { normalizePredictionLeagueStandings } from "./prediction-league-data";

const valid = {
  profileId: "profile-1",
  displayName: "Solarian fan",
  score: "0.000",
  rounds: "1",
  position: "1",
  lastScoredAt: null,
};

describe("Prediction League canonical standings adapter", () => {
  it("preserves valid zero-point standing and converts PostgreSQL numeric strings", () => {
    expect(normalizePredictionLeagueStandings([valid])).toEqual([
      { ...valid, score: 0, rounds: 1, position: 1 },
    ]);
  });

  it("rejects malformed numeric values rather than displaying NaN or false ranks", () => {
    for (const row of [
      { ...valid, score: "NaN" },
      { ...valid, score: "Infinity" },
      { ...valid, score: "" },
      { ...valid, score: "-1" },
      { ...valid, rounds: "0" },
      { ...valid, rounds: "-1" },
      { ...valid, rounds: "1.5" },
      { ...valid, position: "0" },
      { ...valid, position: "3.14" },
    ]) {
      expect(() => normalizePredictionLeagueStandings([row])).toThrow("invalid canonical row");
    }
  });

  it("rejects broken public identity and an entire partially malformed response", () => {
    expect(() => normalizePredictionLeagueStandings([{ ...valid, displayName: "   " }])).toThrow();
    expect(() => normalizePredictionLeagueStandings([valid, { ...valid, score: "Infinity" }])).toThrow();
  });

  it("preserves authoritative order, ties and ranking without client-side scoring", () => {
    const rows = [
      { ...valid, profileId: "profile-1", score: "22.5", rounds: "2", position: "1" },
      { ...valid, profileId: "profile-2", score: "22.5", rounds: "2", position: "1" },
      { ...valid, profileId: "profile-3", score: "12", rounds: "1", position: "2" },
    ];
    const projected = normalizePredictionLeagueStandings(rows);
    expect(projected.map((row) => [row.profileId, row.position, row.score])).toEqual([
      ["profile-1", 1, 22.5],
      ["profile-2", 1, 22.5],
      ["profile-3", 2, 12],
    ]);
  });
});
