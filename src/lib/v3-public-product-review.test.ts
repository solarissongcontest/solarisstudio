import { describe, expect, it } from "vitest";
import { V3_PUBLIC_CAPABILITIES } from "./v3-capability-registry";
import {
  buildV3PublicProductReviewRows,
  validateV3PublicProductReviewRegistry,
  V3_PUBLIC_PRODUCT_REVIEW_OVERRIDES,
} from "./v3-public-product-review";

describe("V3 Public product review registry", () => {
  it("covers every canonical Public capability without borrowing migration status as product evidence", () => {
    const rows = buildV3PublicProductReviewRows();

    expect(rows).toHaveLength(V3_PUBLIC_CAPABILITIES.length);
    expect(new Set(rows.map((row) => row.capabilityId)).size).toBe(rows.length);

    for (const row of rows) {
      const capability = V3_PUBLIC_CAPABILITIES.find((item) => item.id === row.capabilityId);
      expect(capability).toBeDefined();
      expect(row.migrationStatus).toBe(capability?.specificationStatus);
      expect(row).toHaveProperty("productParity");
      expect(row).toHaveProperty("verification");
      expect(row).toHaveProperty("certification");
    }
  });

  it("fails closed when migration is advanced but independent product evidence is absent", () => {
    const rows = buildV3PublicProductReviewRows();
    const overrideIds = new Set(V3_PUBLIC_PRODUCT_REVIEW_OVERRIDES.map((item) => item.capabilityId));
    const technicallyAdvanced = rows.filter(
      (row) =>
        ["parity", "cutover", "retired"].includes(row.migrationStatus) &&
        !overrideIds.has(row.capabilityId),
    );

    expect(technicallyAdvanced.length).toBeGreaterThan(0);
    for (const row of technicallyAdvanced) {
      expect(row.productParity).toBe("unaudited");
      expect(row.verification).toBe("untested");
      expect(row.certification).toBe("uncertified");
      expect(row.blocker).toMatch(/product-parity review/i);
    }
  });

  it("rejects unknown, duplicated or unsupported certification evidence", () => {
    expect(validateV3PublicProductReviewRegistry()).toEqual([]);

    const invalid = validateV3PublicProductReviewRegistry(V3_PUBLIC_CAPABILITIES, [
      {
        capabilityId: "not-a-real-capability",
        productParity: "parity",
        verification: "visual-tested",
        certification: "released",
        evidence: [],
      },
      {
        capabilityId: "not-a-real-capability",
        productParity: "partial",
        verification: "workflow-tested",
        certification: "candidate-certified",
        evidence: ["example"],
      },
    ]);

    expect(invalid).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Unknown Public capability product-review override/),
        expect.stringMatching(/Duplicate Public capability product-review override/),
        expect.stringMatching(/product parity parity requires evidence/),
        expect.stringMatching(/released requires evidence/),
        expect.stringMatching(/candidate-certified requires productParity=parity/),
      ]),
    );
  });
});
