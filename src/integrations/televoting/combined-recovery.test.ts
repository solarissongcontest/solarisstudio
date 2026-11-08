import { describe, expect, it } from "vitest";
import { assessCombinedPublicationRecovery } from "./combined-recovery";

describe("Combined publication recovery", () => {
  const sourceRows = [
    { countryCode: "AA", points: 10 },
    { countryCode: "BB", points: -2 },
  ];

  it("recognizes a reconciled canonical projection", () => {
    expect(assessCombinedPublicationRecovery({
      published: true,
      sourceRows,
      projectionRows: sourceRows,
      snapshot: { rowCount: 2, expectedRowCount: 2 },
    })).toEqual({ canonical: "reconciled", snapshot: "complete" });
  });

  it("distinguishes missing projection from rebuildable snapshot failure", () => {
    expect(assessCombinedPublicationRecovery({
      published: true,
      sourceRows,
      projectionRows: [],
      snapshot: { rowCount: 0, expectedRowCount: 2 },
    })).toEqual({ canonical: "missing", snapshot: "incomplete" });
  });

  it("detects stale values and pending publication", () => {
    expect(assessCombinedPublicationRecovery({
      published: true,
      sourceRows,
      projectionRows: [{ countryCode: "AA", points: 10 }, { countryCode: "BB", points: 0 }],
    }).canonical).toBe("mismatch");
    expect(assessCombinedPublicationRecovery({
      published: false,
      sourceRows,
      projectionRows: [],
    }).canonical).toBe("pending");
  });
});
