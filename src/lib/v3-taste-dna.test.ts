import { describe, expect, it } from "vitest";

import {
  buildV3TasteDnaAnalysis,
  projectTasteHistory,
  reconcileTasteRanking,
} from "./v3-taste-dna";

describe("Taste DNA V3 projection", () => {
  it("reconciles saved preference order against the current published field", () => {
    expect(
      reconcileTasteRanking(
        ["country-b", "removed-country", "country-b", "country-a"],
        ["country-a", "country-b", "country-c"],
      ),
    ).toEqual(["country-b", "country-a", "country-c"]);
  });

  it("keeps the active show out of longitudinal history", () => {
    expect(
      projectTasteHistory(
        [
          { showId: "show-current", ranking: ["a", "b", "c"] },
          { showId: "show-old", ranking: ["c", "a", "b"] },
        ],
        "show-current",
      ),
    ).toEqual([{ showId: "show-old", ranking: ["c", "a", "b"] }]);
  });

  it("builds the personal profile from the reconciled current ranking and private history", () => {
    const analysis = buildV3TasteDnaAnalysis({
      currentShowId: "show-current",
      ranking: ["b", "a", "removed"],
      results: [
        { id: "a", juryPoints: 12, televotePoints: 3, totalPoints: 15, officialRank: 2 },
        { id: "b", juryPoints: 8, televotePoints: 20, totalPoints: 28, officialRank: 1 },
        { id: "c", juryPoints: 4, televotePoints: 7, totalPoints: 11, officialRank: 3 },
      ],
      juryBallots: [{ key: "jury-x", name: "Jury X", ranking: ["a", "b", "c"] }],
      savedBallots: [
        { showId: "show-current", ranking: ["a", "b", "c"] },
        { showId: "show-old", ranking: ["b", "c", "a"] },
      ],
      nameForId: (id) => id.toUpperCase(),
    });

    expect(analysis.ranking).toEqual(["b", "a", "c"]);
    expect(analysis.history).toEqual([{ showId: "show-old", ranking: ["b", "c", "a"] }]);
    expect(analysis.profile).not.toBeNull();
    expect(analysis.profile?.similarJuries[0]?.name).toBe("Jury X");
  });
});
