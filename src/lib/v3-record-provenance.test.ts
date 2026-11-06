import { describe, expect, it } from "vitest";
import type { Edition, JuryVote, ResultRow, Show } from "./data";
import type { FanRecord } from "./fan-records";
import { attachV3RecordProvenance } from "./v3-record-provenance";

const edition = {
  id: "e22",
  edition_number: 22,
  name: "Hanvør",
  slug: "ssc-22-hanvor",
} as unknown as Edition;

const semi = {
  id: "semi-22",
  edition_id: "e22",
  name: "Semi-Final 1",
  kind: "semi-final",
  sort_order: 1,
} as unknown as Show;

const final = {
  id: "final-22",
  edition_id: "e22",
  name: "Grand Final",
  kind: "grand-final",
  sort_order: 3,
} as unknown as Show;

const holder = {
  countryId: "oland",
  countryName: "Oland",
  shortCode: "OLA",
  flagImage: null,
  accentColor: "#fff",
  editionId: "e22",
  editionLabel: "SSC 22 · Hanvør",
};

function record(category: FanRecord["category"]): FanRecord {
  return {
    id: `record-${category}`,
    label: "Example",
    value: "12",
    category,
    explanation: "Example record",
    holders: [holder],
  };
}

function juryVote(showId: string): JuryVote {
  return {
    edition_id: "e22",
    show_id: showId,
    voter_country_id: "oland",
    receiving_country_id: "other",
    points: 12,
  } as unknown as JuryVote;
}

describe("V3 Records provenance", () => {
  it("uses a voting matrix only when one exact published voting show is provable", () => {
    const output = attachV3RecordProvenance({
      records: [record("voting")],
      editions: [edition],
      shows: [semi, final],
      results: [],
      jury: [juryVote("semi-22")],
    });

    expect(output[0]?.holders[0]?.provenance).toEqual({
      kind: "voting",
      label: "Semi-Final 1 voting matrix",
      href: "/shows/semi-22?tab=matrix&from=results",
    });
  });

  it("does not pretend one matrix is exact when multiple voting shows match", () => {
    const output = attachV3RecordProvenance({
      records: [record("voting")],
      editions: [edition],
      shows: [semi, final],
      results: [],
      jury: [juryVote("semi-22"), juryVote("final-22")],
    });

    expect(output[0]?.holders[0]?.provenance).toEqual({
      kind: "edition",
      label: "SSC 22 archive context",
      href: "/editions/ssc-22-hanvor",
    });
  });

  it("prefers the published final result when an edition has multiple result shows", () => {
    const output = attachV3RecordProvenance({
      records: [record("edition")],
      editions: [edition],
      shows: [semi, final],
      jury: [],
      results: [
        { edition_id: "e22", show_id: "semi-22", country_id: "oland" } as unknown as ResultRow,
        { edition_id: "e22", show_id: "final-22", country_id: "oland" } as unknown as ResultRow,
      ],
    });

    expect(output[0]?.holders[0]?.provenance).toEqual({
      kind: "result",
      label: "Grand Final result",
      href: "/shows/final-22?from=results",
    });
  });

  it("falls back to the edition archive only when no exact published result source exists", () => {
    const output = attachV3RecordProvenance({
      records: [record("unusual")],
      editions: [edition],
      shows: [],
      jury: [],
      results: [],
    });

    expect(output[0]?.holders[0]?.provenance).toEqual({
      kind: "edition",
      label: "SSC 22 archive context",
      href: "/editions/ssc-22-hanvor",
    });
  });

  it("does not invent one source for aggregate holders without edition context", () => {
    const aggregate = record("career");
    aggregate.holders = [{ ...holder, editionId: undefined, editionLabel: undefined }];
    const output = attachV3RecordProvenance({
      records: [aggregate],
      editions: [edition],
      shows: [final],
      jury: [],
      results: [],
    });

    expect(output[0]?.holders[0]?.provenance).toBeNull();
  });
});
