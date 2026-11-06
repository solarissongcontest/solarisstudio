import { describe, expect, it } from "vitest";

import {
  buildCanonicalFanRecords,
  buildCanonicalFanRecordsWithCoverage,
} from "./canonical-fan-records";

function publishedFixture() {
  return {
    countries: [],
    editions: [
      { id: "e1", edition_number: 1, name: "SSC 1", slug: "ssc-1", published: true },
    ],
    shows: [
      {
        id: "final-1",
        edition_id: "e1",
        name: "Grand Final",
        kind: "grand-final",
        published: true,
        status: "complete",
        publication_config: {
          participants: true,
          artists: true,
          songs: true,
          semi_split: true,
          running_order: true,
          qualifiers: true,
          results: true,
          jury_results: true,
          televote_results: true,
          detailed_voting: true,
        },
      },
    ],
    participants: [],
    results: [
      {
        id: "r1", edition_id: "e1", show_id: "final-1",
        country_id: "a", jury_points: 50, televote_points: 60,
        total_points: 110, final_rank: 1,
      },
    ],
    jury: [],
  } as any;
}

describe("Public Records archive coverage", () => {
  it("counts distinct published final editions, never raw result rows", () => {
    const input = publishedFixture();
    input.results.push({ ...input.results[0], id: "r2", country_id: "b", final_rank: 2 });
    const summary = buildCanonicalFanRecordsWithCoverage(input);
    expect(summary.archivedFinalEditions).toBe(1);
    expect(summary.records).toEqual(buildCanonicalFanRecords(input));
  });

  it("does not count results prepared for a show whose results are not published", () => {
    const input = publishedFixture();
    // Overall result publication is only one of four layers that can
    // authorize public result rows. Keep all result-bearing layers closed.
    Object.assign(input.shows[0].publication_config, {
      results: false,
      jury_results: false,
      televote_results: false,
      detailed_voting: false,
    });
    expect(buildCanonicalFanRecordsWithCoverage(input).archivedFinalEditions).toBe(0);
  });

  it("never counts final rows belonging to an unpublished edition", () => {
    const input = publishedFixture();
    input.editions[0].published = false;
    expect(buildCanonicalFanRecordsWithCoverage(input).archivedFinalEditions).toBe(0);
  });

  it("does not mislabel semi-final results as completed final editions", () => {
    const input = publishedFixture();
    input.shows[0].kind = "semi-final";
    expect(buildCanonicalFanRecordsWithCoverage(input).archivedFinalEditions).toBe(0);
  });

  it("does not count a result that crosses into another edition's published show", () => {
    const input = publishedFixture();
    input.editions.push({
      ...input.editions[0], id: "e2", edition_number: 2, slug: "ssc-2",
    });
    input.results.push({
      ...input.results[0], id: "cross-edition", edition_id: "e2",
    });
    expect(buildCanonicalFanRecordsWithCoverage(input).archivedFinalEditions).toBe(1);
  });
});
