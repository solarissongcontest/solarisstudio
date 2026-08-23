import { describe, expect, it } from "vitest";

import {
  hasMultipleTelevoteRounds,
  parseTelevoteComponents,
  resolveVoting,
  televoteComponentTotal,
  televoteRoundSummary,
} from "./voting";

describe("multi-round televoting", () => {
  it("keeps legacy shows on one 100% televote round", () => {
    const voting = resolveVoting({ televoteEnabled: true });

    expect(voting.televoteRounds).toEqual([
      { id: "televote", label: "Televote", weight: 100 },
    ]);
    expect(hasMultipleTelevoteRounds(voting)).toBe(false);
  });

  it("preserves a two-round 65/35 public vote without inventing a jury", () => {
    const voting = resolveVoting({
      juryEnabled: false,
      televoteEnabled: true,
      televoteMode: "total",
      televoteRounds: [
        { id: "web", label: "Web voting", weight: 65 },
        { id: "instagram", label: "Instagram voting", weight: 35 },
      ],
    });

    expect(voting.juryEnabled).toBe(false);
    expect(hasMultipleTelevoteRounds(voting)).toBe(true);
    expect(voting.televoteRounds.map((round) => round.weight)).toEqual([65, 35]);
    expect(televoteRoundSummary(voting)).toBe("Web voting 65% · Instagram voting 35%");
  });

  it("adds the stored round contributions into the combined public-vote total", () => {
    const components = [
      { round_id: "web", label: "Web voting", points: 216, raw_votes: 7, percentage: 17.95 },
      { round_id: "instagram", label: "Instagram voting", points: 124, raw_votes: 4, percentage: 19.05 },
    ];

    expect(parseTelevoteComponents(components)).toHaveLength(2);
    expect(televoteComponentTotal(components)).toBe(340);
  });
});
