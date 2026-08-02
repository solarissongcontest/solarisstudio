import { describe, expect, it } from "vitest";
import { computeStandings, pairMatrix, topRecipients, topSupporters } from "./analysis";
import type { JuryVote, Televote } from "./data";
import { DEFAULT_VOTING, parsePointList, resolveVoting, topPoint } from "./voting";

const jv = (voter: string, to: string, points: number, i = 0): JuryVote => ({
  id: `j${voter}${to}${points}${i}`,
  edition_id: "e1",
  show_id: "s1",
  voter_country_id: voter,
  receiving_country_id: to,
  points,
});

const tv = (country: string, points: number): Televote => ({
  id: `t${country}`,
  edition_id: "e1",
  show_id: "s1",
  country_id: country,
  points,
});

describe("computeStandings", () => {
  it("sums jury and televote points and ranks them", () => {
    const rows = computeStandings(
      ["a", "b", "c"],
      [jv("b", "a", 12), jv("c", "a", 10), jv("a", "b", 12)],
      [tv("a", 5), tv("b", 30), tv("c", 0)],
    );
    expect(rows.map((r) => [r.countryId, r.total, r.rank])).toEqual([
      ["b", 42, 1],
      ["a", 27, 2],
      ["c", 0, 3],
    ]);
  });

  it("includes countries with no votes at all", () => {
    const rows = computeStandings(["a", "b"], [], []);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.total === 0)).toBe(true);
  });

  it("keeps jury and televote totals separate", () => {
    const [row] = computeStandings(["a"], [jv("b", "a", 8)], [tv("a", 3)]);
    expect(row.jury).toBe(8);
    expect(row.televote).toBe(3);
    expect(row.total).toBe(11);
  });

  it("breaks ties on televote first by default", () => {
    const rows = computeStandings(
      ["a", "b"],
      [jv("x", "a", 10)],
      [tv("a", 2), tv("b", 12)],
    );
    expect(rows[0]!.countryId).toBe("b");
  });

  it("falls through the tie-break chain to top-point count", () => {
    const rows = computeStandings(
      ["a", "b"],
      [jv("x", "a", 12), jv("y", "b", 6), jv("z", "b", 6)],
      [tv("a", 0), tv("b", 0)],
      { ...DEFAULT_VOTING, tieBreak: ["televote", "twelves"] },
    );
    expect(rows[0]!.countryId).toBe("a");
    expect(rows[0]!.topPoints).toBe(1);
  });

  it("counts top points against the show's own scale, not a hard-coded 12", () => {
    const cfg = { ...DEFAULT_VOTING, juryPoints: [5, 3, 1] };
    const rows = computeStandings(["a"], [jv("x", "a", 5)], [], cfg);
    expect(rows[0]!.topPoints).toBe(1);
  });

  it("only applies weighting when the show opts into weighted scoring", () => {
    const jury = [jv("x", "a", 10)];
    const tele = [tv("a", 10)];
    const plain = computeStandings(["a"], jury, tele, {
      ...DEFAULT_VOTING,
      weighting: { jury: 75, televote: 25 },
    });
    expect(plain[0]!.total).toBe(20);

    const weighted = computeStandings(["a"], jury, tele, {
      ...DEFAULT_VOTING,
      weighting: { jury: 75, televote: 25 },
      weightedScoring: true,
    });
    expect(weighted[0]!.total).toBe(20); // 10*1.5 + 10*0.5
  });
});

describe("pairMatrix / supporters", () => {
  it("aggregates repeated exchanges between the same pair", () => {
    const m = pairMatrix([jv("a", "b", 12, 1), jv("a", "b", 8, 2), jv("b", "a", 1)]);
    expect(m.get("a>b")).toMatchObject({ points: 20, count: 2, twelves: 1 });
    expect(m.get("b>a")).toMatchObject({ points: 1, count: 1, twelves: 0 });
  });

  it("ranks supporters and recipients by points", () => {
    const votes = [jv("a", "c", 12), jv("b", "c", 3), jv("c", "a", 7)];
    expect(topSupporters(votes, "c")).toEqual([
      ["a", 12],
      ["b", 3],
    ]);
    expect(topRecipients(votes, "c")).toEqual([["a", 7]]);
  });
});

describe("voting config", () => {
  it("fills missing fields from the defaults", () => {
    const cfg = resolveVoting({ juryEnabled: false });
    expect(cfg.juryEnabled).toBe(false);
    expect(cfg.juryPoints).toEqual(DEFAULT_VOTING.juryPoints);
    expect(cfg.tieBreak).toEqual(DEFAULT_VOTING.tieBreak);
  });

  it("keeps a custom point scale", () => {
    const cfg = resolveVoting({ juryPoints: [7, 4, 1] });
    expect(cfg.juryPoints).toEqual([7, 4, 1]);
    expect(topPoint(cfg)).toBe(7);
  });

  it("treats an empty scale as unset rather than valid", () => {
    expect(resolveVoting({ juryPoints: [] }).juryPoints).toEqual(DEFAULT_VOTING.juryPoints);
  });

  it("parses, cleans and sorts a typed point list", () => {
    expect(parsePointList("3, 12 abc 0 -5 7")).toEqual([12, 7, 3]);
  });
});
