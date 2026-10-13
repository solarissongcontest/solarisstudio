import { describe, expect, it } from "vitest";

import {
  buildV3ResultsProjection,
  type V3ResultProjectionInput,
} from "./v3-results";

function input(
  overrides: Partial<V3ResultProjectionInput> = {},
): V3ResultProjectionInput {
  return {
    editionId: "ssc22",
    editionName: "Solaris Song Contest 22",
    showId: "final",
    showName: "Grand Final",
    publication: "published",
    disclosure: "revealed",
    rows: [
      {
        countryId: "vendia",
        countryName: "Vendia",
        flagUrl: "/flags/vendia.webp",
        rank: 2,
        points: 284,
        juryPoints: 140,
        televotePoints: 144,
      },
      {
        countryId: "oland",
        countryName: "Oland",
        flagUrl: "/flags/oland.webp",
        rank: 1,
        points: 312,
        juryPoints: 160,
        televotePoints: 152,
      },
    ],
    juryPublished: true,
    televotePublished: true,
    userDelegationCountryId: "oland",
    resultTools: [
      { key: "scorechart", label: "Scorechart", href: "/scorecharts" },
      {
        key: "jury-vs-televote",
        label: "Jury vs televote",
        href: "/analysis",
      },
      {
        key: "country-breakdown",
        label: "Country breakdown",
        href: "/shows/final?from=results",
      },
    ],
    advancedTools: [
      { key: "relationships", label: "Relationships", href: "/relationships" },
      { key: "voting-dna", label: "Voting DNA", href: "/voting-dna" },
      { key: "records", label: "Records", href: "/records" },
      { key: "result-lab", label: "Result Lab", href: "/result-lab" },
    ],
    ...overrides,
  };
}

describe("V3 Results projection", () => {
  it("fails closed before official publication", () => {
    const projection = buildV3ResultsProjection(input({ publication: "hidden" }));

    expect(projection.status).toBe("unpublished");
    expect(projection.officialResult.rows).toEqual([]);
    expect(projection.officialResult.winner).toBeNull();
    expect(projection.yourResult).toBeNull();
    expect(projection.exploreThisResult).toEqual([]);
    expect(projection.moreAnalysis).toEqual([]);
  });

  it("does not leak winner, points, delegation result or tools through spoiler protection", () => {
    const projection = buildV3ResultsProjection(input({ disclosure: "withheld" }));

    expect(projection.status).toBe("spoiler-protected");
    expect(projection.tabs).toEqual([]);
    expect(projection.officialResult).toEqual({ winner: null, rows: [] });
    expect(projection.yourResult).toBeNull();
    expect(projection.exploreThisResult).toEqual([]);
    expect(projection.moreAnalysis).toEqual([]);
  });

  it("puts the official result first and derives the user's delegation result from the same rows", () => {
    const projection = buildV3ResultsProjection(input());

    expect(projection.status).toBe("available");
    expect(projection.officialResult.rows.map((row) => row.countryId)).toEqual([
      "oland",
      "vendia",
    ]);
    expect(projection.officialResult.winner?.countryId).toBe("oland");
    expect(projection.yourResult).toMatchObject({
      countryId: "oland",
      rank: 1,
      points: 312,
    });
  });

  it("does not invent a winner when published rows contain no canonical rank one", () => {
    const projection = buildV3ResultsProjection(
      input({
        rows: [
          {
            countryId: "vendia",
            countryName: "Vendia",
            flagUrl: "/flags/vendia.webp",
            rank: 2,
            points: 284,
          },
          {
            countryId: "oland",
            countryName: "Oland",
            flagUrl: "/flags/oland.webp",
            rank: 3,
            points: 270,
          },
        ],
      }),
    );

    expect(projection.status).toBe("available");
    expect(projection.officialResult.rows.map((row) => row.rank)).toEqual([2, 3]);
    expect(projection.officialResult.winner).toBeNull();
  });

  it("only exposes jury and televote tabs when those components are officially published", () => {
    expect(buildV3ResultsProjection(input()).tabs).toEqual([
      "combined",
      "jury",
      "televote",
    ]);
    expect(
      buildV3ResultsProjection(
        input({ juryPublished: false, televotePublished: true }),
      ).tabs,
    ).toEqual(["combined", "televote"]);
    expect(
      buildV3ResultsProjection(
        input({ juryPublished: false, televotePublished: false }),
      ).tabs,
    ).toEqual(["combined"]);
  });

  it("keeps immediate result exploration separate from advanced analysis", () => {
    const projection = buildV3ResultsProjection(input());

    expect(projection.exploreThisResult.map((tool) => tool.key)).toEqual([
      "scorechart",
      "jury-vs-televote",
      "country-breakdown",
    ]);
    expect(projection.moreAnalysis.map((tool) => tool.key)).toEqual([
      "relationships",
      "voting-dna",
      "records",
      "result-lab",
    ]);
  });
});
