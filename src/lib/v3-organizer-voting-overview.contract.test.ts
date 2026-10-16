import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const votingOverview = readFileSync("src/routes/televoting/admin/index.tsx", "utf8");

describe("V3 Organizer Voting overview", () => {
  it("does not call the legacy overview fallback without an explicit Organizer edition", () => {
    expect(votingOverview).toContain("enabled: Boolean(editionId)");
    expect(votingOverview).toContain('queryKey: ["merged-televoting-admin-overview", editionId ?? "none"]');
    expect(votingOverview).toContain("editionId: editionId!");
    expect(votingOverview).toContain("Select an edition");
    expect(votingOverview).toContain("will not substitute a globally active or newest edition");
  });

  it("surfaces integrity blockers before ordinary live/closed voting status", () => {
    expect(votingOverview).toContain('data.blocked > 0');
    expect(votingOverview).toContain("Review integrity");
    expect(votingOverview).toContain('data-v3-organizer-voting=""');
  });

  it("keeps the overview read-only and routes mutations to owning workspaces", () => {
    expect(votingOverview).not.toContain("integrations/supabase/client");
    expect(votingOverview).not.toContain(".from(");
    expect(votingOverview).not.toContain(".rpc(");
    expect(votingOverview).toContain('/televoting/admin/rounds');
    expect(votingOverview).toContain('/televoting/admin/integrity');
    expect(votingOverview).toContain('/admin/results');
  });
});
