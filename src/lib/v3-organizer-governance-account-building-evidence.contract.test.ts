import { describe, expect, it } from "vitest";

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";

const MERGED_GOVERNANCE_AND_ACCOUNT_CAPABILITIES = [
  "trust-rule-rulings",
  "trust-appeals",
  "trust-evidence",
  "trust-disclosure",
  "trust-identity-access",
  "trust-rules-manager",
  "trust-interpretations",
  "workspace-country-accounts",
] as const;

describe("V3 Organizer governance and account status evidence", () => {
  it("reports merged partial governance and country-account work as building", () => {
    const byId = new Map(
      V3_ORGANIZER_CAPABILITY_REGISTRY.map((item) => [item.legacyId, item]),
    );

    for (const id of MERGED_GOVERNANCE_AND_ACCOUNT_CAPABILITIES) {
      const capability = byId.get(id);
      expect(capability, `${id} must remain represented in the Organizer registry`).toBeDefined();
      expect(capability?.migrationStatus, `${id} has merged Organizer V3 evidence`).toBe(
        "building",
      );
    }
  });

  it("does not promote review-boundary work to parity or cutover", () => {
    const tracked = V3_ORGANIZER_CAPABILITY_REGISTRY.filter((item) =>
      MERGED_GOVERNANCE_AND_ACCOUNT_CAPABILITIES.includes(
        item.legacyId as (typeof MERGED_GOVERNANCE_AND_ACCOUNT_CAPABILITIES)[number],
      ),
    );

    expect(tracked).toHaveLength(MERGED_GOVERNANCE_AND_ACCOUNT_CAPABILITIES.length);
    for (const capability of tracked) {
      expect(["parity", "cutover", "retired"]).not.toContain(capability.migrationStatus);
    }
  });

  it("keeps Combined Results outside this governance/account evidence claim without freezing its own status", () => {
    const combined = V3_ORGANIZER_CAPABILITY_REGISTRY.find(
      (item) => item.legacyId === "voting-combined-results",
    );

    expect(combined).toBeDefined();
    expect(combined?.migrationStatus).toBe("building");
    expect(["parity", "cutover", "retired"]).not.toContain(combined?.migrationStatus);
    expect(MERGED_GOVERNANCE_AND_ACCOUNT_CAPABILITIES).not.toContain(
      "voting-combined-results" as (typeof MERGED_GOVERNANCE_AND_ACCOUNT_CAPABILITIES)[number],
    );
  });
});
