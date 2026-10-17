import { describe, expect, it } from "vitest";

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";

describe("V3 Organizer Publication status", () => {
  it("advances Publication only to building", () => {
    const capability = V3_ORGANIZER_CAPABILITY_REGISTRY.find(
      (item) => item.legacyId === "current-edition-publish",
    );

    expect(capability?.targetDomain).toBe("voting-results");
    expect(capability?.migrationStatus).toBe("building");
  });
});
