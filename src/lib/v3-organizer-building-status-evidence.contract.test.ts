import { describe, expect, it } from "vitest";

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";

const MERGED_PARTIAL_CAPABILITIES = [
  "live-review-reveal-director",
  "voting-jury",
  "voting-rules",
  "voting-televote-totals",
  "voting-public-results",
  "voting-result-integrity",
  "voting-edition-links",
] as const;

describe("V3 Organizer capability status evidence", () => {
  it("reports capabilities with merged partial implementation as building", () => {
    const byId = new Map(
      V3_ORGANIZER_CAPABILITY_REGISTRY.map((item) => [item.legacyId, item]),
    );

    for (const id of MERGED_PARTIAL_CAPABILITIES) {
      const capability = byId.get(id);
      expect(capability, `${id} must remain represented in the Organizer registry`).toBeDefined();
      expect(capability?.migrationStatus, `${id} has merged V3 implementation evidence`).toBe(
        "building",
      );
    }
  });

  it("does not confuse partial implementation with parity or cutover", () => {
    const tracked = V3_ORGANIZER_CAPABILITY_REGISTRY.filter((item) =>
      MERGED_PARTIAL_CAPABILITIES.includes(
        item.legacyId as (typeof MERGED_PARTIAL_CAPABILITIES)[number],
      ),
    );

    expect(tracked).toHaveLength(MERGED_PARTIAL_CAPABILITIES.length);
    for (const capability of tracked) {
      expect(["parity", "cutover", "retired"]).not.toContain(capability.migrationStatus);
    }
  });
});
