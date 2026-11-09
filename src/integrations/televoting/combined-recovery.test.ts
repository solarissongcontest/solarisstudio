import { describe, expect, it } from "vitest";
import { assessCombinedPublicationRecovery } from "./combined-recovery";

describe("Combined publication recovery", () => {
  const sourceRows = [
    { countryCode: "AA", points: 10 },
    { countryCode: "BB", points: -2 },
  ];
  const snapshotRows = [
    {
      roundId: "round-a",
      countryCode: "AA",
      sourceType: "round",
      displayOrder: 0,
      finalPoints: 10,
      rawScore: 5,
      activityPoints: null,
      weightPercent: 100,
      countryContributions: { BB: 2 },
    },
  ];

  it("recognizes a reconciled canonical projection", () => {
    expect(
      assessCombinedPublicationRecovery({
        published: true,
        sourceRows,
        projectionRows: sourceRows,
        snapshot: { expectedRows: snapshotRows, actualRows: snapshotRows },
      }),
    ).toEqual({ canonical: "reconciled", snapshot: "complete" });
  });

  it("distinguishes missing projection from rebuildable snapshot failure", () => {
    expect(
      assessCombinedPublicationRecovery({
        published: true,
        sourceRows,
        projectionRows: [],
        snapshot: { expectedRows: snapshotRows, actualRows: [] },
      }),
    ).toEqual({ canonical: "missing", snapshot: "incomplete" });
  });

  it("detects stale, extra, duplicate, negative, and unverifiable projections", () => {
    expect(
      assessCombinedPublicationRecovery({
        published: true,
        sourceRows,
        projectionRows: [
          { countryCode: "AA", points: 10 },
          { countryCode: "BB", points: 0 },
        ],
      }).canonical,
    ).toBe("mismatch");
    expect(
      assessCombinedPublicationRecovery({
        published: true,
        sourceRows,
        projectionRows: [
          ...sourceRows,
          { countryCode: "CC", points: 1 },
        ],
      }).canonical,
    ).toBe("mismatch");
    expect(
      assessCombinedPublicationRecovery({
        published: true,
        sourceRows,
        projectionRows: [...sourceRows, { countryCode: "AA", points: 10 }],
      }).canonical,
    ).toBe("mismatch");
    expect(
      assessCombinedPublicationRecovery({
        published: true,
        sourceRows,
        projectionRows: [{ countryCode: "AA", points: 10 }, { countryCode: "BB", points: -2 }],
      }).canonical,
    ).toBe("reconciled");
    expect(
      assessCombinedPublicationRecovery({
        published: true,
        sourceRows: [],
        projectionRows: [],
      }).canonical,
    ).toBe("unverifiable");
  });

  it("compares snapshot content rather than row count", () => {
    expect(
      assessCombinedPublicationRecovery({
        published: true,
        sourceRows,
        projectionRows: sourceRows,
        snapshot: {
          expectedRows: snapshotRows,
          actualRows: [{ ...snapshotRows[0], finalPoints: 9 }],
        },
      }).snapshot,
    ).toBe("incomplete");
    expect(
      assessCombinedPublicationRecovery({
        published: true,
        sourceRows,
        projectionRows: sourceRows,
        snapshot: {
          expectedRows: snapshotRows,
          actualRows: [{ ...snapshotRows[0], countryCode: "CC" }],
        },
      }).snapshot,
    ).toBe("incomplete");
    expect(
      assessCombinedPublicationRecovery({
        published: true,
        sourceRows,
        projectionRows: sourceRows,
        snapshot: { expectedRows: snapshotRows, actualRows: [], readable: false },
      }).snapshot,
    ).toBe("unverifiable");
  });

  it("keeps pending publication distinct", () => {
    expect(
      assessCombinedPublicationRecovery({
        published: false,
        sourceRows,
        projectionRows: [],
      }).canonical,
    ).toBe("pending");
  });
});
