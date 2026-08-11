import {
  buildBroadcastIntelligence,
  buildResultsReplay,
  replayProgress,
  type BroadcastEntry,
} from "./broadcast-intelligence";

import {
  describe,
  expect,
  it,
} from "vitest";

const entries: BroadcastEntry[] = [
  {
    id: "a",
    name: "A",
    juryPoints: 120,
    televotePoints: 20,
    totalPoints: 140,
    officialRank: 2,
  },
  {
    id: "b",
    name: "B",
    juryPoints: 70,
    televotePoints: 150,
    totalPoints: 220,
    officialRank: 1,
  },
  {
    id: "c",
    name: "C",
    juryPoints: 60,
    televotePoints: 30,
    totalPoints: 90,
    officialRank: 3,
  },
  {
    id: "d",
    name: "D",
    juryPoints: 10,
    televotePoints: 40,
    totalPoints: 50,
    officialRank: 4,
  },
];

describe("Broadcast Intelligence", () => {
  it("finds the official winner", () => {
    const intelligence =
      buildBroadcastIntelligence(entries);

    expect(intelligence.winner?.id).toBe(
      "b",
    );
  });

  it("finds separate jury and televote winners", () => {
    const intelligence =
      buildBroadcastIntelligence(entries);

    expect(
      intelligence.juryWinner?.id,
    ).toBe("a");

    expect(
      intelligence.televoteWinner?.id,
    ).toBe("b");
  });

  it("detects a jury-result overturn", () => {
    const intelligence =
      buildBroadcastIntelligence(entries);

    expect(
      intelligence.moments.some(
        (moment) =>
          moment.id ===
          "winner-overturn",
      ),
    ).toBe(true);
  });

  it("builds a deterministic televote replay", () => {
    const replay =
      buildResultsReplay(entries);

    expect(replay).toHaveLength(4);

    /*
     * Lowest jury-ranked country is
     * revealed first.
     */
    expect(replay[0]?.countryId).toBe(
      "d",
    );

    /*
     * Jury winner receives its televote
     * last.
     */
    expect(
      replay[replay.length - 1]
        ?.countryId,
    ).toBe("a");
  });

  it("adds televote to the live scoreboard as steps progress", () => {
    const start =
      replayProgress(entries, 0);

    const oneReveal =
      replayProgress(entries, 1);

    const dAtStart = start.find(
      (row) => row.id === "d",
    );

    const dAfterReveal =
      oneReveal.find(
        (row) => row.id === "d",
      );

    expect(
      dAtStart?.liveScore,
    ).toBe(10);

    expect(
      dAfterReveal?.liveScore,
    ).toBe(50);

    expect(
      dAfterReveal?.televoteRevealed,
    ).toBe(true);
  });
});
