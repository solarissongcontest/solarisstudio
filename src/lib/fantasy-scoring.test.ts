import { describe, expect, it } from "vitest";
import { scoreFantasyEntry } from "./fantasy-scoring";

describe("Fantasy SSC scoring v1", () => {
  it("is deterministic and explainable", () => {
    expect(scoreFantasyEntry({ rank: 1, juryPoints: 240, televotePoints: 180, qualified: true })).toEqual({
      placement: 25,
      jury: 12,
      televote: 9,
      qualification: 8,
      subtotal: 54,
      multiplier: 1,
      total: 54,
      version: "v1",
    });
  });

  it("applies the captain multiplier only after the base score", () => {
    const score = scoreFantasyEntry({
      rank: 10,
      juryPoints: 39,
      televotePoints: 40,
      qualified: false,
      captain: true,
      captainMultiplier: 2,
    });
    expect(score.subtotal).toBe(19);
    expect(score.total).toBe(38);
  });

  it("never awards negative placement or point bonuses", () => {
    expect(scoreFantasyEntry({ rank: 40, juryPoints: 0, televotePoints: 0, qualified: null }).total).toBe(0);
  });
});
