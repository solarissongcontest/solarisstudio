import { describe, expect, it } from "vitest";

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";

describe("V3 Organizer Voting declarations status", () => {
  it("retains the accepted exact-edition declaration cutover with governed evidence", () => {
    const capability = V3_ORGANIZER_CAPABILITY_REGISTRY.find(
      (item) => item.legacyId === "current-edition-voting-declarations",
    );

    expect(capability?.targetDomain).toBe("voting-results");
    expect(capability?.migrationStatus).toBe("cutover");
    expect(capability?.migrationEvidence).toContain("v3-organizer-specialist-acceptance.contract.test.ts");
    expect(capability?.migrationEvidence).toContain("20261018122500_v3_voting_declaration_expected_edition_scope.sql");
  });
});
