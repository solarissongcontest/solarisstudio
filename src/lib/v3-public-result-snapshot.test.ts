import { describe, expect, it } from "vitest";

import { parseV3PublishedResultSnapshot } from "./v3-public-result-snapshot";

const EDITION_ID = "11111111-1111-4111-8111-111111111111";
const SHOW_ID = "22222222-2222-4222-8222-222222222222";
const COUNTRY_A = "33333333-3333-4333-8333-333333333333";
const COUNTRY_B = "44444444-4444-4444-8444-444444444444";

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    publicationState: "public",
    publicationVersion: 4,
    resultVersion: 2,
    publicationUpdatedAt: "2026-10-20T10:00:00.000Z",
    resultVersionCreatedAt: "2026-10-20T09:55:00.000Z",
    show: {
      id: SHOW_ID,
      editionId: EDITION_ID,
      name: "Grand Final",
      kind: "grand-final",
    },
    edition: {
      id: EDITION_ID,
      number: 22,
      name: "Solaris Song Contest 22",
      slug: "ssc-22",
    },
    availability: {
      results: true,
      jury: true,
      televote: true,
      detailedVoting: false,
    },
    rowCount: 2,
    rows: [
      {
        countryId: COUNTRY_A,
        contestEntityId: null,
        totalPoints: 312,
        finalRank: 1,
        juryPoints: 160,
        televotePoints: 152,
      },
      {
        countryId: COUNTRY_B,
        contestEntityId: null,
        totalPoints: 281,
        finalRank: 2,
        juryPoints: 140,
        televotePoints: 141,
      },
    ],
    ...overrides,
  };
}

describe("V3 public exact Result snapshot", () => {
  it("accepts the exact publication-safe immutable projection", () => {
    const parsed = parseV3PublishedResultSnapshot(snapshot());

    expect(parsed?.resultVersion).toBe(2);
    expect(parsed?.publicationVersion).toBe(4);
    expect(parsed?.rows.map((row) => row.finalRank)).toEqual([1, 2]);
  });

  it("treats null as the canonical fail-closed unavailable state", () => {
    expect(parseV3PublishedResultSnapshot(null)).toBeNull();
  });

  it("rejects row-count drift instead of repairing System evidence in Public", () => {
    expect(() =>
      parseV3PublishedResultSnapshot(snapshot({ rowCount: 1 })),
    ).toThrow(/rowCount must match immutable snapshot rows/);
  });

  it("rejects cross-edition Show identity", () => {
    expect(() =>
      parseV3PublishedResultSnapshot(
        snapshot({
          show: {
            id: SHOW_ID,
            editionId: "55555555-5555-4555-8555-555555555555",
            name: "Grand Final",
            kind: "grand-final",
          },
        }),
      ),
    ).toThrow(/Show must belong to the projected Edition/);
  });

  it("rejects split-result fields when their publication layer is hidden", () => {
    const value = snapshot({
      availability: {
        results: true,
        jury: false,
        televote: true,
        detailedVoting: false,
      },
      rows: [
        {
          countryId: COUNTRY_A,
          contestEntityId: null,
          totalPoints: 312,
          finalRank: 1,
          juryPoints: 160,
          televotePoints: 152,
        },
        {
          countryId: COUNTRY_B,
          contestEntityId: null,
          totalPoints: 281,
          finalRank: 2,
          juryPoints: 140,
          televotePoints: 141,
        },
      ],
    });

    expect(() => parseV3PublishedResultSnapshot(value)).toThrow(
      /Unpublished Jury points must not be present/,
    );
  });

  it("rejects missing split-result fields when their publication layer is public", () => {
    const value = snapshot();
    const rows = (value.rows as Array<Record<string, unknown>>).map((row, index) =>
      index === 0
        ? Object.fromEntries(Object.entries(row).filter(([key]) => key !== "juryPoints"))
        : row,
    );

    expect(() =>
      parseV3PublishedResultSnapshot({ ...value, rows }),
    ).toThrow(/Published Jury points must be present/);
  });

  it("rejects detailed voting payload when detailed voting is unpublished", () => {
    const value = snapshot();
    const rows = (value.rows as Array<Record<string, unknown>>).map((row, index) =>
      index === 0 ? { ...row, televoteComponents: { app: 100 } } : row,
    );

    expect(() =>
      parseV3PublishedResultSnapshot({ ...value, rows }),
    ).toThrow(/Unpublished detailed voting must not be present/);
  });

  it("rejects detailed voting availability unless both split layers are public", () => {
    const value = snapshot({
      availability: {
        results: true,
        jury: true,
        televote: false,
        detailedVoting: true,
      },
      rows: [
        {
          countryId: COUNTRY_A,
          contestEntityId: null,
          totalPoints: 312,
          finalRank: 1,
          juryPoints: 160,
          televoteComponents: { app: 100 },
        },
        {
          countryId: COUNTRY_B,
          contestEntityId: null,
          totalPoints: 281,
          finalRank: 2,
          juryPoints: 140,
          televoteComponents: { app: 90 },
        },
      ],
    });

    expect(() => parseV3PublishedResultSnapshot(value)).toThrow(
      /Detailed voting cannot be public while a split Result layer is hidden/,
    );
  });

  it("requires detailed voting payload when detailed voting is public", () => {
    const value = snapshot({
      availability: {
        results: true,
        jury: true,
        televote: true,
        detailedVoting: true,
      },
    });

    expect(() => parseV3PublishedResultSnapshot(value)).toThrow(
      /Published detailed voting must be present/,
    );
  });

  it("requires durable row identity and rejects duplicate canonical identities", () => {
    const missingIdentity = snapshot();
    (missingIdentity.rows as Array<Record<string, unknown>>)[0] = {
      ...(missingIdentity.rows as Array<Record<string, unknown>>)[0],
      countryId: null,
      contestEntityId: null,
    };
    expect(() => parseV3PublishedResultSnapshot(missingIdentity)).toThrow(
      /requires canonical country or contest entity identity/,
    );

    const duplicateIdentity = snapshot();
    (duplicateIdentity.rows as Array<Record<string, unknown>>)[1] = {
      ...(duplicateIdentity.rows as Array<Record<string, unknown>>)[1],
      countryId: COUNTRY_A,
    };
    expect(() => parseV3PublishedResultSnapshot(duplicateIdentity)).toThrow(
      /duplicate canonical row identity/,
    );
  });
});
