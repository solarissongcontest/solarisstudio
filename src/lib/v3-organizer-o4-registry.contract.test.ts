import { describe, expect, it } from "vitest";

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";

function capability(id: string) {
  const item = V3_ORGANIZER_CAPABILITY_REGISTRY.find((candidate) => candidate.legacyId === id);
  if (!item) throw new Error(`Missing Organizer capability ${id}`);
  return item;
}

describe("V3 Organizer O4 capability registry", () => {
  it("separates accepted Delegations/Confirmation cutovers from still-building slices", () => {
    for (const id of [
      "current-edition-delegations",
      "delegation-confirmation-overview",
      "delegation-confirmation-requirements",
      "delegation-settings",
    ]) {
      expect(capability(id).migrationStatus).toBe("cutover");
      expect(capability(id).migrationEvidence).toBeTruthy();
    }

    for (const id of [
      "delegation-confirmation-responses",
      "delegation-next-in-line",
      "delegation-responses-by-country",
      "delegation-submission-rounds",
      "delegation-access",
      "delegation-submission-history",
      "delegation-sync",
    ]) {
      expect(capability(id).migrationStatus).toBe("building");
      expect(["parity", "cutover", "retired"]).not.toContain(capability(id).migrationStatus);
    }
  });

  it("accepts governed edition-binding authority without promoting separate sync authority", () => {
    const binding = capability("delegation-edition-links");
    expect(binding.migrationStatus).toBe("cutover");
    expect(binding.ownerCapability).toBe("confirmation.read"); // Route read; mutation separately requires delegation.manage.
    expect(binding.migrationEvidence).toContain("v3-confirmation-edition-binding-rehearsal.sh");
    expect(binding.migrationEvidence).toContain("v3-organizer-edition-links-explicit-mutations.contract.test.ts");
    expect(binding.migrationEvidence).toContain("20261027110823_binding_version_conflict_http_contract.sql");
    expect(capability("delegation-sync").migrationStatus).toBe("building");

    const settings = capability("delegation-settings");
    expect(settings.migrationStatus).toBe("cutover");
    expect(settings.migrationEvidence).toContain("v3-organizer-specialist-acceptance.contract.test.ts");
  });

  it("accepts only the exact actor/edition Calendar projection after scoped SQL denial proof", () => {
    const calendar = capability("delegation-calendar");
    expect(calendar.migrationStatus).toBe("cutover");
    expect(calendar.ownerCapability).toBe("confirmation.read");
    expect(calendar.migrationEvidence).toContain("v3-organizer-confirmation-calendar.test.ts");
    expect(calendar.migrationEvidence).toContain("v3-confirmation-maintenance-edit-rehearsal.sh");
    expect(calendar.migrationEvidence).toContain("20261017201000_confirmation_maintenance_postgrest_path_and_reads.sql");
    expect(capability("delegation-submission-history").migrationStatus).toBe("building");
    expect(capability("delegation-confirmation-responses").migrationStatus).toBe("building");
  });

  it("keeps Eligibility in Contest instead of treating it as delegation authority", () => {
    expect(capability("operations-eligibility").targetDomain).toBe("contest");
  });
});
