import { describe, expect, it } from "vitest";

import { buildAllTimeScoreRanking } from "./all-time-ranking";

function show(id: string, editionId: string, kind: string) {
  return { id, edition_id: editionId, kind } as any;
}

function result(
  id: string,
  countryId: string,
  editionId: string,
  showId: string,
  total: number,
  rank: number,
) {
  return {
    id,
    country_id: countryId,
    edition_id: editionId,
    show_id: showId,
    total_points: total,
    jury_points: 0,
    televote_points: total,
    final_rank: rank,
  } as any;
}

describe("all-time score ranking", () => {
  it("counts Grand Final score only once per edition and ignores semi-final score", () => {
    const shows = [
      show("s1", "e1", "semi-final"),
      show("f1", "e1", "grand-final"),
      show("f2", "e2", "grand-final"),
    ];
    const rows = buildAllTimeScoreRanking(shows, [
      result("a-semi", "a", "e1", "s1", 80, 2),
      result("a-final", "a", "e1", "f1", 120, 5),
      result("a-final-2", "a", "e2", "f2", 100, 8),
      result("b-final", "b", "e1", "f1", 210, 1),
    ]);

    expect(rows.find((row) => row.countryId === "a")?.score).toBe(220);
    expect(rows.find((row) => row.countryId === "a")?.finals).toBe(2);
    expect(rows.find((row) => row.countryId === "a")?.rank).toBe(1);
  });

  it("uses competition ranking for tied all-time scores", () => {
    const shows = [show("f1", "e1", "grand-final")];
    const rows = buildAllTimeScoreRanking(shows, [
      result("a", "a", "e1", "f1", 100, 1),
      result("b", "b", "e1", "f1", 100, 2),
      result("c", "c", "e1", "f1", 80, 3),
    ]);

    expect(rows.map((row) => [row.countryId, row.rank])).toEqual([
      ["a", 1],
      ["b", 1],
      ["c", 3],
    ]);
  });
});
