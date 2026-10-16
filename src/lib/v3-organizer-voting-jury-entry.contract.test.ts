import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const votingOverview = readFileSync("src/routes/televoting/admin/index.tsx", "utf8");

describe("V3 Organizer Voting overview Jury ownership", () => {
  it("surfaces Jury as a primary Voting workspace instead of hiding it in specialist navigation", () => {
    expect(votingOverview).toContain('title="Jury"');
    expect(votingOverview).toContain("Manage the selected edition's jury roster, ballots");
    expect(votingOverview).toContain('title="Public voting rounds & entries"');
  });

  it("routes Jury only from the exact Organizer edition slug", () => {
    expect(votingOverview).toContain("const { editionId, editionSlug } = useAdminContext();");
    expect(votingOverview).toContain('to={`/admin/jury/${editionSlug}`}');
    expect(votingOverview).toContain("Solaris will not guess an edition slug.");
    expect(votingOverview).not.toContain("/admin/jury/latest");
  });

  it("does not manufacture Jury readiness from public Televote summary data", () => {
    expect(votingOverview).toContain("WorkspaceUnavailableRow");
    expect(votingOverview).not.toContain("Jury ready");
    expect(votingOverview).not.toContain("Jury complete");
  });
});
