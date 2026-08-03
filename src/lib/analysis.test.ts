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

/* ---------------------------------------------------------------- */

import { computeRecords, countryProfile } from "./analysis";
import type { ResultRow, Show } from "./data";
import { makeTopScoreResolver } from "./voting";

const show = (id: string, kind: string, points?: number[]): Show =>
  ({
    id,
    edition_id: "e1",
    name: id,
    kind,
    sort_order: 1,
    published: true,
    status: "done",
    qualifier_count: null,
    theme_id: null,
    voting_config: points ? { juryPoints: points } : {},
    broadcast_config: {},
  }) as Show;

const jvs = (voter: string, to: string, points: number, showId: string, i = 0): JuryVote => ({
  ...jv(voter, to, points, i),
  show_id: showId,
});

const res = (
  country: string,
  showId: string,
  o: { edition?: string; jury?: number; tele?: number; rank?: number | null } = {},
): ResultRow => ({
  id: `${country}-${showId}`,
  edition_id: o.edition ?? "e1",
  show_id: showId,
  country_id: country,
  jury_points: o.jury ?? 0,
  televote_points: o.tele ?? 0,
  total_points: (o.jury ?? 0) + (o.tele ?? 0),
  final_rank: o.rank ?? null,
});

describe("configured top score, not hard-coded 12", () => {
  const shows = [show("s12", "grand-final"), show("s10", "semi-final", [10, 8, 6, 4, 2]), show("s5", "semi-final", [5, 3, 1])];
  const resolve = makeTopScoreResolver(shows);

  it("counts the maximum of each show's own scale", () => {
    const votes = [jvs("a", "b", 12, "s12"), jvs("a", "b", 10, "s10"), jvs("a", "b", 5, "s5")];
    expect(pairMatrix(votes, resolve).get("a>b")!.topScoreCount).toBe(3);
  });

  it("does not count a 12 on a 10-point scale, nor a 10 on a 12-point scale", () => {
    const votes = [jvs("a", "b", 10, "s12"), jvs("a", "b", 8, "s10")];
    expect(pairMatrix(votes, resolve).get("a>b")!.topScoreCount).toBe(0);
  });

  it("keeps classic 12-point behaviour when no config is known", () => {
    expect(pairMatrix([jvs("a", "b", 12, "unknown")]).get("a>b")!.topScoreCount).toBe(1);
  });

  it("resolves each show separately when scales are mixed", () => {
    const profile = countryProfile(
      "b",
      [res("b", "s10", { jury: 10 })],
      [jvs("a", "b", 10, "s10"), jvs("a", "b", 12, "s12"), jvs("b", "a", 5, "s5")],
      new Map([["e1", 2026]]),
      { shows },
    );
    expect(profile.topScoresReceived).toBe(2);
    expect(profile.topScoresGiven).toBe(1);
  });
});

describe("weighting", () => {
  it("changes the total when jury and televote differ", () => {
    const jury = [jv("x", "a", 20)];
    const tele = [tv("a", 4)];
    expect(computeStandings(["a"], jury, tele)[0]!.total).toBe(24);
    const weighted = computeStandings(["a"], jury, tele, {
      ...DEFAULT_VOTING,
      weighting: { jury: 75, televote: 25 },
      weightedScoring: true,
    });
    expect(weighted[0]!.total).toBe(32); // 20*1.5 + 4*0.5
  });
});

describe("participation counting", () => {
  const shows = [show("semi", "semi-final"), show("final", "grand-final")];
  const year = new Map([
    ["e1", 2025],
    ["e2", 2026],
  ]);

  it("counts a semi-only country as one participation", () => {
    const p = countryProfile("a", [res("a", "semi", { rank: 12 })], [], year, { shows });
    expect(p.participations).toBe(1);
    expect(p.showAppearances).toBe(1);
    expect(p.semiFinalAppearances).toBe(1);
    expect(p.qualifications).toBe(0);
    expect(p.nonQualifications).toBe(1);
  });

  it("does not double-count a country that sang in a semi and the final", () => {
    const p = countryProfile(
      "a",
      [res("a", "semi", { rank: 3 }), res("a", "final", { rank: 5 })],
      [],
      year,
      { shows },
    );
    expect(p.participations).toBe(1);
    expect(p.showAppearances).toBe(2);
    expect(p.qualifications).toBe(1);
    expect(p.history).toHaveLength(1);
    expect(p.history[0]!.rank).toBe(5); // final placement, not the semi
  });

  it("counts multiple editions separately", () => {
    const p = countryProfile(
      "a",
      [
        res("a", "semi", { edition: "e1", rank: 2 }),
        res("a", "final", { edition: "e1", rank: 1 }),
        res("a", "final", { edition: "e2", rank: 4 }),
      ],
      [],
      year,
      { shows },
    );
    expect(p.participations).toBe(2);
    expect(p.showAppearances).toBe(3);
    expect(p.wins).toBe(1);
    expect(p.average).toBeCloseTo(2.5);
  });
});

describe("records", () => {
  const shows = [show("semi1", "semi-final"), show("semi2", "semi-final", [10, 8, 6, 4, 2]), show("final", "grand-final")];
  const year = new Map([["e1", 2026]]);
  const countries = [
    { id: "a", name: "Aland" },
    { id: "b", name: "Belor" },
    { id: "c", name: "Cyre" },
  ] as Country[];

  it("groups margins by show, never mixing a semi with the final", () => {
    const rows = [
      res("a", "semi1", { jury: 100, rank: 1 }),
      res("b", "semi1", { jury: 98, rank: 2 }),
      res("a", "final", { jury: 50, rank: 1 }),
      res("c", "final", { jury: 10, rank: 2 }),
    ];
    const recs = computeRecords(rows, [], countries, year, { shows });
    const biggest = recs.find((r) => r.label.startsWith("Largest winning margin"))!;
    const closest = recs.find((r) => r.label.startsWith("Closest finish"))!;
    expect(biggest.value).toBe("40"); // inside the final, not 100 - 10 across shows
    expect(closest.value).toBe("2");
  });

  it("handles tied scores inside a show", () => {
    const rows = [res("a", "final", { jury: 30 }), res("b", "final", { jury: 30 })];
    const recs = computeRecords(rows, [], countries, year, { shows });
    expect(recs.find((r) => r.label.startsWith("Closest finish"))!.value).toBe("0");
  });

  it("measures comeback and collapse as places moved, not point gaps", () => {
    const rows = [
      res("a", "final", { jury: 50, tele: 0 }), // jury 1st -> final 2nd
      res("b", "final", { jury: 10, tele: 60 }), // jury 3rd -> final 1st
      res("c", "final", { jury: 40, tele: 5 }), // jury 2nd -> final 3rd
    ];
    const recs = computeRecords(rows, [], countries, year, { shows });
    const comeback = recs.find((r) => r.label.startsWith("Biggest comeback"))!;
    const collapse = recs.find((r) => r.label.startsWith("Biggest collapse"))!;
    expect(comeback.value).toBe("+2");
    expect(comeback.detail).toContain("Belor");
    expect(collapse.value).toBe("-1");
  });

  it("counts top scores per show scale in the all-time records", () => {
    const rows = [res("a", "semi2", { jury: 10 })];
    const recs = computeRecords(rows, [jvs("b", "a", 10, "semi2"), jvs("c", "a", 12, "semi2")], countries, year, {
      shows,
    });
    expect(recs.find((r) => r.label === "Most top scores received")!.value).toBe("1");
  });
});
