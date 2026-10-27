import { describe, expect, it } from "vitest";

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";

function capability(id: string) {
  const item = V3_ORGANIZER_CAPABILITY_REGISTRY.find((candidate) => candidate.legacyId === id);
  if (!item) throw new Error(`Missing Organizer capability ${id}`);
  return item;
}

describe("V3 Organizer O4 capability registry", () => {
  it("marks implemented Delegations and Confirmation slices building, never parity", () => {
    for (const id of [
      "current-edition-delegations",
      "delegation-confirmation-overview",
      "delegation-confirmation-requirements",
      "delegation-confirmation-responses",
      "delegation-next-in-line",
      "delegation-responses-by-country",
      "delegation-submission-rounds",
      "delegation-calendar",
      "delegation-access",
      "delegation-submission-history",
      "delegation-sync",
      "delegation-settings",
    ]) {
      expect(capability(id).migrationStatus).toBe("building");
      expect(["parity", "cutover", "retired"]).not.toContain(capability(id).migrationStatus);
    }
  });

  it("accepts only the governed edition-binding authority after clean and upgrade runtime proof", () => {
    const binding = capability("delegation-edition-links");
    expect(binding.migrationStatus).toBe("cutover");
    expect(binding.ownerCapability).toBe("confirmation.read"); // Route read; mutation separately requires delegation.manage.
    expect(binding.migrationEvidence).toContain("v3-confirmation-edition-binding-rehearsal.sh");
    expect(binding.migrationEvidence).toContain("v3-organizer-edition-links-explicit-mutations.contract.test.ts");
    expect(binding.migrationEvidence).toContain("20261027110823_binding_version_conflict_http_contract.sql");
    // Governed binding does not certify separate sync/settings authorities.
    expect(capability("delegation-sync").migrationStatus).toBe("building");
    expect(capability("delegation-settings").migrationStatus).toBe("building");
  });

  it("keeps Eligibility in Contest instead of treating it as delegation authority", () => {
    expect(capability("operations-eligibility").targetDomain).toBe("contest");
  });
});
