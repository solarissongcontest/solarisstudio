import { describe, expect, it } from "vitest";
import { V3_PROJECTION_RECONCILIATION_REGISTRY } from "./v3-projection-reconciliation-registry";

const confirmationProjections = V3_PROJECTION_RECONCILIATION_REGISTRY.filter((projection) =>
  projection.canonicalDomains.includes("confirmation"),
);

describe("System V3 S6 Confirmation verifier registry evidence", () => {
  it("binds every Confirmation projection to the bounded canonical requirement verifier", () => {
    expect(confirmationProjections.length).toBeGreaterThan(0);
    for (const projection of confirmationProjections) {
      expect(projection.repair.scope).toBe("edition");
      expect(projection.repair.verificationPath).toContain(
        "studio2_verify_confirmation_requirements",
      );
      expect(projection.repair.boundedBy).toContain("500");
      expect(projection.repair.evidence).toContain(
        "supabase/migrations/20261018053000_v3_s6_confirmation_requirement_reconciliation.sql",
      );
      expect(projection.repair.evidence).toContain(
        "src/lib/v3-s6-confirmation-requirement-reconciliation.contract.test.ts",
      );
    }
  });

  it("does not misrepresent canonical Confirmation state as rebuildable", () => {
    for (const projection of confirmationProjections) {
      expect(projection.repair.state).toBe("foundation");
      expect(projection.repair.rebuildPath).toBeNull();
      expect(projection.repair.boundedBy).toContain("no bulk canonical rebuild writer");
    }
  });
});
