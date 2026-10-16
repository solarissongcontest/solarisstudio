import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const votingLab = readFileSync("src/routes/_authenticated/admin/voting-lab.tsx", "utf8");

describe("V3 Organizer Voting Lab scope", () => {
  it("never requests an all-editions ballot sample", () => {
    expect(votingLab).toContain("editionId ?? 'none'");
    expect(votingLab).not.toContain("editionId ?? 'all'");
    expect(votingLab).toContain("featureQuery.data === true && Boolean(editionId)");
    expect(votingLab).toContain("editionId: editionId!");
    expect(votingLab).not.toContain("editionId: editionId ?? null");
  });

  it("clears the selected voting round when Organizer edition context changes", () => {
    expect(votingLab).toContain("setRoundId('')");
    expect(votingLab).toContain("[editionId]");
  });

  it("renders a fail-closed no-scope state", () => {
    expect(votingLab).toContain('title="Select an edition"');
    expect(votingLab).toContain("will not load an all-editions ballot sample or substitute another edition");
  });
});
