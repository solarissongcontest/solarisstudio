import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/televoting/admin/rounds.tsx", "utf8");
const view = readFileSync("src/components/televoting/VotingRoundsView.tsx", "utf8");

describe("V3 Organizer Voting Rounds edition boundary", () => {
  it("remounts local command state when the Organizer edition changes", () => {
    expect(route).toContain("const { editionId } = useAdminContext();");
    expect(route).toContain('<VotingRoundsView key={editionId ?? "unscoped"} />');
  });

  it("keeps the underlying voting read fail-closed to explicit edition context", () => {
    expect(view).toContain('queryKey: ["merged-televoting-rounds-page", editionId]');
    expect(view).toContain("enabled: Boolean(editionId)");
    expect(view).toContain("getRoundsPage({ data: { editionId } })");
  });

  it("protects every stale local voting command state behind the keyed boundary", () => {
    for (const state of [
      "createOpen",
      "editing",
      "deleteTarget",
      "pendingStatus",
    ]) {
      expect(view).toContain(state);
    }
    expect(route).toContain("rename/delete/live-status command");
  });
});
