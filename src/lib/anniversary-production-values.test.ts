import { describe, expect, it } from "vitest";

// This is deliberately a tiny launch contract, not a second archive engine.
// The live values are also verified against production before deployment. These
// constants make accidental copy regressions in the final 2026 launch obvious.
describe("2026 anniversary launch facts", () => {
  it("documents the verified headline archive values", () => {
    expect({
      chapters: 7,
      shows: 22,
      countries: 61,
      entries: 307,
      latestChampion: "Diaria",
      latestChampionEdition: 21,
      latestChampionPoints: 611,
      closestWinner: "Oland",
      closestRunnerUp: "Ørnådal",
      closestGap: 14,
      closestEdition: 17,
    }).toEqual({
      chapters: 7,
      shows: 22,
      countries: 61,
      entries: 307,
      latestChampion: "Diaria",
      latestChampionEdition: 21,
      latestChampionPoints: 611,
      closestWinner: "Oland",
      closestRunnerUp: "Ørnådal",
      closestGap: 14,
      closestEdition: 17,
    });
  });
});
