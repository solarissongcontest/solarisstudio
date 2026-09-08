import { describe, expect, it } from "vitest";

import { canonicalEditionResults } from "./canonical-results";

function show(id: string, editionId: string, kind: string) {
  return { id, edition_id: editionId, name: id, kind } as any;
}

function result(id: string, countryId: string, editionId: string, showId: string, rank: number, points: number) {
  return {
    id,
    country_id: countryId,
    edition_id: editionId,
    show_id: showId,
    jury_points: 0,
    televote_points: points,
    total_points: points,
    final_rank: rank,
  } as any;
}

describe("canonical edition results", () => {
  it("uses the Grand Final row instead of adding semi and final for the same edition", () => {
    const shows = [show("semi", "e1", "semi-final"), show("final", "e1", "grand-final")];
    const canonical = canonicalEditionResults([
      result("a-semi", "a", "e1", "semi", 1, 70),
      result("a-final", "a", "e1", "final", 2, 150),
    ], shows);

    expect(canonical).toHaveLength(1);
    expect(canonical[0]?.id).toBe("a-final");
  });

  it("keeps semi and heat results for countries eliminated before the final", () => {
    const shows = [
      show("heat", "e1", "heat"),
      show("semi", "e1", "semi-final"),
      show("final", "e1", "grand-final"),
    ];
    const canonical = canonicalEditionResults([
      result("a-semi", "a", "e1", "semi", 8, 90),
      result("b-heat", "b", "e1", "heat", 6, 50),
      result("c-final", "c", "e1", "final", 1, 200),
    ], shows);

    expect(canonical.find((row) => row.country_id === "a")?.id).toBe("a-semi");
    expect(canonical.find((row) => row.country_id === "b")?.id).toBe("b-heat");
    expect(canonical.find((row) => row.country_id === "c")?.id).toBe("c-final");
  });
});
