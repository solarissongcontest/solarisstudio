import { describe, expect, it } from "vitest";

import { simulateResultLab } from "./result-lab";
import { buildTasteDna, rankingSimilarity } from "./taste-dna";

describe("Result Lab", () => {
  const officialEntries = [
    { id: "a", name: "A", juryPoints: 100, televotePoints: 20, officialRank: 2 },
    { id: "b", name: "B", juryPoints: 40, televotePoints: 120, officialRank: 1 },
    { id: "c", name: "C", juryPoints: 50, televotePoints: 30, officialRank: 3 },
  ];

  it("keeps the official order with a 50/50 balanced-points blend when official totals decide it", () => {
    const result = simulateResultLab({
      officialEntries,
      juryVotes: [],
      config: {
        juryWeight: 50,
        televoteWeight: 50,
        blendMode: "raw",
        juryScheme: "original",
        tieBreak: "televote",
        excludedVoters: new Set(),
      },
    });

    expect(result.rows.map((row) => row.id)).toEqual(["b", "a", "c"]);
    expect(result.juryPoolTotal).toBe(result.televotePoolTotal);
  });

  it("can flip the winner to the jury leader", () => {
    const result = simulateResultLab({
      officialEntries,
      juryVotes: [],
      config: {
        juryWeight: 100,
        televoteWeight: 0,
        blendMode: "raw",
        juryScheme: "original",
        tieBreak: "jury",
        excludedVoters: new Set(),
      },
    });

    expect(result.rows[0]?.id).toBe("a");
    expect(result.televotePoolTotal).toBe(0);
  });

  it("removes one jury and keeps 50/50 totals exact", () => {
    const result = simulateResultLab({
      officialEntries,
      juryVotes: [
        { voterKey: "jury-1", recipientId: "a", points: 12 },
        { voterKey: "jury-1", recipientId: "b", points: 10 },
        { voterKey: "jury-1", recipientId: "c", points: 8 },
        { voterKey: "jury-2", recipientId: "b", points: 12 },
        { voterKey: "jury-2", recipientId: "a", points: 10 },
        { voterKey: "jury-2", recipientId: "c", points: 8 },
      ],
      config: {
        juryWeight: 50,
        televoteWeight: 50,
        blendMode: "raw",
        juryScheme: "original",
        tieBreak: "televote",
        excludedVoters: new Set(["jury-2"]),
      },
    });

    const juryTotal = result.rows.reduce((sum, row) => sum + row.simulatedJuryPoints, 0);
    const televoteTotal = result.rows.reduce((sum, row) => sum + row.simulatedTelevotePoints, 0);

    expect(result.includedVoterCount).toBe(1);
    expect(juryTotal).toBe(televoteTotal);
    expect(juryTotal).toBe(result.juryPoolTotal);
    expect(televoteTotal).toBe(result.televotePoolTotal);
    expect(result.rows.every((row) => Number.isInteger(row.simulatedJuryPoints))).toBe(true);
    expect(result.rows.every((row) => Number.isInteger(row.simulatedTelevotePoints))).toBe(true);
    expect(result.rows.every((row) => Number.isInteger(row.simulatedScore))).toBe(true);
  });

  it("keeps a 60/40 balance as an exact 3:2 whole-number ratio", () => {
    const result = simulateResultLab({
      officialEntries,
      juryVotes: [],
      config: {
        juryWeight: 60,
        televoteWeight: 40,
        blendMode: "raw",
        juryScheme: "original",
        tieBreak: "televote",
        excludedVoters: new Set(),
      },
    });

    expect(result.juryPoolTotal * 2).toBe(result.televotePoolTotal * 3);
    expect(result.rows.every((row) => Number.isInteger(row.simulatedScore))).toBe(true);
  });
});

describe("Taste DNA", () => {
  it("returns 100 for the same ranking", () => {
    expect(rankingSimilarity(["a", "b", "c"], ["a", "b", "c"])).toBe(100);
  });

  it("recognizes a jury-leaning ranking", () => {
    const profile = buildTasteDna({
      ranking: ["a", "b", "c", "d"],
      results: [
        { id: "a", juryPoints: 100, televotePoints: 10, totalPoints: 110, officialRank: 1 },
        { id: "b", juryPoints: 80, televotePoints: 20, totalPoints: 100, officialRank: 2 },
        { id: "c", juryPoints: 20, televotePoints: 80, totalPoints: 100, officialRank: 3 },
        { id: "d", juryPoints: 10, televotePoints: 100, totalPoints: 110, officialRank: 4 },
      ],
      juryBallots: [],
      history: [],
      nameForId: (id) => id,
    });

    expect(profile).not.toBeNull();
    expect(profile!.jurySimilarity).toBeGreaterThan(profile!.televoteSimilarity);
    expect(profile!.juryLean).toBeGreaterThan(50);
  });
});
