import { describe, expect, it } from "vitest";

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";

describe("V3 Organizer Voting declarations status", () => {
  it("advances exact-edition declarations only to building", () => {
    const capability = V3_ORGANIZER_CAPABILITY_REGISTRY.find(
      (item) => item.legacyId === "current-edition-voting-declarations",
    );

    expect(capability?.targetDomain).toBe("voting-results");
    expect(capability?.migrationStatus).toBe("building");
  });
});
