import { describe, expect, it } from "vitest";
import { computeStandings } from "@/lib/analysis";
import type { JuryVote, Televote } from "@/lib/data";
import { DEFAULT_VOTING } from "@/lib/voting";

const jury = (from: string, to: string, points: number): JuryVote => ({
  id: `jury-${from}-${to}-${points}`,
  edition_id: "edition",
  show_id: "show",
  voter_country_id: from,
  receiving_country_id: to,
  points,
});

const televote = (to: string, points: number): Televote => ({
  id: `televote-${to}`,
  edition_id: "edition",
  show_id: "show",
  country_id: to,
  points,
});

describe("Broadcast standings countback follows the configured jury scale", () => {
  it("breaks equal total scores and equal 12s by the number of 10s", () => {
    const rows = computeStandings(
      ["a", "b"],
      [
        jury("x", "a", 12), jury("y", "a", 8), jury("z", "a", 2),
        jury("x", "b", 12), jury("y", "b", 10),
      ],
      [],
      { ...DEFAULT_VOTING, tieBreak: ["countback"] },
    );
    expect(rows.map((row) => [row.countryId, row.total, row.topPoints, row.rank])).toEqual([
      ["b", 22, 1, 1],
      ["a", 22, 1, 2],
    ]);
  });

  it("keeps 'twelves' distinct from full countback", () => {
    const votes = [
      jury("x", "a", 12), jury("y", "a", 8), jury("z", "a", 2),
      jury("x", "b", 12), jury("y", "b", 10),
    ];
    const twelvesOnly = computeStandings(
      ["a", "b"], votes, [], { ...DEFAULT_VOTING, tieBreak: ["twelves"] },
    );
    const fullCountback = computeStandings(
      ["a", "b"], votes, [], { ...DEFAULT_VOTING, tieBreak: ["countback"] },
    );
    expect(twelvesOnly.map((row) => row.countryId)).toEqual(["a", "b"]);
    expect(fullCountback.map((row) => row.countryId)).toEqual(["b", "a"]);
  });

  it("uses the configured show scale rather than hard-coded 12/10 awards", () => {
    const votes = [
      jury("x", "a", 5), jury("y", "a", 1), jury("z", "a", 1), jury("w", "a", 1),
      jury("x", "b", 5), jury("y", "b", 3),
    ];
    const standings = computeStandings(
      ["a", "b"], votes, [],
      { ...DEFAULT_VOTING, juryPoints: [5, 3, 1], tieBreak: ["countback"] },
    );
    expect(standings.map((row) => [row.countryId, row.total])).toEqual([
      ["b", 8], ["a", 8],
    ]);
  });

  it("normalizes an unsorted and repeated configured scale before countback", () => {
    const votes = [
      jury("x", "a", 5), jury("y", "a", 1), jury("z", "a", 1), jury("w", "a", 1),
      jury("x", "b", 5), jury("y", "b", 3),
    ];
    const standings = computeStandings(
      ["a", "b"], votes, [],
      { ...DEFAULT_VOTING, juryPoints: [1, 5, 3, 5, 0], tieBreak: ["countback"] },
    );
    expect(standings.map((row) => row.countryId)).toEqual(["b", "a"]);
    expect(standings[0]?.topPoints).toBe(1);
  });

  it("preserves earlier tie-break rules before countback", () => {
    const standings = computeStandings(
      ["a", "b"],
      [
        jury("x", "a", 12), jury("y", "a", 10),
        jury("x", "b", 12), jury("y", "b", 8),
      ],
      [televote("a", 0), televote("b", 2)],
      { ...DEFAULT_VOTING, tieBreak: ["televote", "countback"] },
    );
    expect(standings.map((row) => row.countryId)).toEqual(["b", "a"]);
  });

  it("falls through full countback to the next configured rule on a true tie", () => {
    const standings = computeStandings(
      ["a", "b"],
      [
        jury("x", "a", 12), jury("y", "a", 8),
        jury("x", "b", 12), jury("y", "b", 8),
      ],
      [],
      { ...DEFAULT_VOTING, tieBreak: ["countback", "runningOrder"] },
      new Map([["a", 1], ["b", 2]]),
    );
    expect(standings.map((row) => row.countryId)).toEqual(["b", "a"]);
  });

  it("keeps the ordinary descending-points ranking unchanged", () => {
    const standings = computeStandings(
      ["a", "b"],
      [jury("x", "a", 12), jury("x", "b", 10)],
      [televote("a", 1), televote("b", 0)],
      { ...DEFAULT_VOTING, tieBreak: ["countback"] },
    );
    expect(standings.map((row) => [row.countryId, row.rank])).toEqual([
      ["a", 1], ["b", 2],
    ]);
  });
});
