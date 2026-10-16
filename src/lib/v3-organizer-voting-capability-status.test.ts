import { describe, expect, it } from "vitest";

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";

function status(legacyId: string) {
  return V3_ORGANIZER_CAPABILITY_REGISTRY.find((item) => item.legacyId === legacyId)?.migrationStatus;
}

describe("V3 Organizer core Voting migration status", () => {
  it("tracks the overview and core child workspaces as actively building", () => {
    expect(status("current-edition-voting")).toBe("building");
    expect(status("voting-rounds-entries")).toBe("building");
    expect(status("voting-jury")).toBe("building");
    expect(status("voting-rules")).toBe("building");
    expect(status("voting-televote-totals")).toBe("building");
  });

  it("does not claim parity while canonical voting authority is still incomplete", () => {
    for (const id of [
      "current-edition-voting",
      "voting-rounds-entries",
      "voting-jury",
      "voting-rules",
      "voting-televote-totals",
    ]) {
      expect(status(id)).not.toBe("parity");
      expect(status(id)).not.toBe("cutover");
      expect(status(id)).not.toBe("retired");
    }
  });
});
