import { describe, expect, it } from "vitest";

import { buildAllTimeScoreRanking, canonicalEditionResults } from "./canonical-results";

function show(id: string, editionId: string, kind: string) {
  return {
    id,
    edition_id: editionId,
    name: id,
    kind,
    sort_order: 1,
    published: true,
    status: "done",
    qualifier_count: null,
    theme_id: null,
    voting_config: {},
    broadcast_config: {},
    publication_config: null,
  } as any;
}

function result(
  id: string,
  countryId: string,
  editionId: string,
  showId: string,
  rank: number,
  points: number,
) {
  return {
    id,
    country_id: countryId,
    edition_id: editionId,
    show_id: showId,
    jury_points: Math.floor(points / 2),
    televote_points: points - Math.floor(points / 2),
    total_points: points,
    final_rank: rank,
  } as any;
}

describe("canonical edition results", () => {
  it("uses the Grand Final row instead of adding semi and final for the same edition", () => {
    const shows = [
      show("semi-1", "e1", "semi-final"),
      show("final-1", "e1", "grand-final"),
    ];
    const rows = [
      result("semi", "a", "e1", "semi-1", 1, 70),
      result("final", "a", "e1", "final-1", 2, 150),
    ];

    const canonical = canonicalEditionResults(rows, shows);
    expect(canonical).toHaveLength(1);
    expect(canonical[0]?.id).toBe("final");
    expect(canonical[0]?.total_points).toBe(150);
  });

  it("keeps the semi-final result when the country did not reach the final", () => {
    const shows = [show("semi-1", "e1", "semi-final")];
    const rows = [result("semi", "a", "e1", "semi-1", 8, 90)];

    const canonical = canonicalEditionResults(rows, shows);
    expect(canonical).toHaveLength(1);
    expect(canonical[0]?.total_points).toBe(90);
  });

  it("builds all-time points from one result per country per edition", () => {
    const shows = [
      show("semi-1", "e1", "semi-final"),
      show("final-1", "e1", "grand-final"),
      show("semi-2", "e2", "semi-final"),
    ];
    const rows = [
      result("a-semi", "a", "e1", "semi-1", 1, 70),
      result("a-final", "a", "e1", "final-1", 2, 150),
      result("b-semi", "b", "e1", "semi-1", 8, 120),
      result("b-e2", "b", "e2", "semi-2", 10, 20),
    ];

    const ranking = buildAllTimeScoreRanking(rows, shows);
    expect(ranking.find((row) => row.countryId === "a")?.totalPoints).toBe(150);
    expect(ranking.find((row) => row.countryId === "a")?.rank).toBe(1);
    expect(ranking.find((row) => row.countryId === "b")?.totalPoints).toBe(140);
    expect(ranking.find((row) => row.countryId === "b")?.rank).toBe(2);
  });

  it("gives equal all-time scores the same competition rank", () => {
    const shows = [show("semi-1", "e1", "semi-final")];
    const rows = [
      result("a", "a", "e1", "semi-1", 1, 100),
      result("b", "b", "e1", "semi-1", 2, 100),
      result("c", "c", "e1", "semi-1", 3, 50),
    ];

    const ranking = buildAllTimeScoreRanking(rows, shows);
    expect(ranking.find((row) => row.countryId === "a")?.rank).toBe(1);
    expect(ranking.find((row) => row.countryId === "b")?.rank).toBe(1);
    expect(ranking.find((row) => row.countryId === "c")?.rank).toBe(3);
  });
});
