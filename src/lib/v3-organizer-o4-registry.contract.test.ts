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
      "delegation-responses-by-country",
      "delegation-submission-rounds",
      "delegation-calendar",
      "delegation-access",
      "delegation-submission-history",
      "delegation-sync",
      "delegation-settings",
    ]) {
      expect(capability(id).migrationStatus).toBe("building");
    }
  });

  it("keeps untouched O4 specialist surfaces planned", () => {
    expect(capability("delegation-next-in-line").migrationStatus).toBe("planned");
    expect(capability("delegation-edition-links").migrationStatus).toBe("planned");
  });

  it("keeps Eligibility in Contest instead of treating it as delegation authority", () => {
    expect(capability("operations-eligibility").targetDomain).toBe("contest");
  });
});
