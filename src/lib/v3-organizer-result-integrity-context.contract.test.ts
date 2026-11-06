import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const route = readFileSync(
  "src/routes/televoting/admin/result-integrity.tsx",
  "utf8",
);

describe("V3 Organizer Result Integrity edition scope", () => {
  it("resolves rounds from the exact selected Organizer edition", () => {
    expect(route).toContain("useAdminContext()");
    expect(route).toContain("<ResultIntegrityPage");
    expect(route).toContain("editionId={editionId}");
    expect(route).toContain("editionLabel={editionLabel?.trim() || editionId}");
    expect(route).toContain("getMergedTelevotingRoundsPage");
    expect(route).toContain("getRoundsPage({ data: { editionId } })");
    expect(route).toContain('["v3-organizer-result-integrity-rounds", editionId]');
    expect(route).not.toContain("useServerFn(getMergedTelevotingRounds);");
    expect(route).not.toContain('queryKey: ["merged-televoting-rounds"]');
  });

  it("rejects result evidence and recompute attempts outside the scoped round projection", () => {
    expect(route).toContain("rounds.some((round) => round.id === effectiveRoundId)");
    expect(route).toContain("result.round.id !== effectiveRoundId");
    expect(route).toContain("returned evidence for a different voting round");
    expect(route).toContain("outside the selected Organizer edition");
    expect(route).toContain('["televoting-result-integrity", editionId, effectiveRoundId]');
  });

  it("fails closed without explicit Organizer edition context", () => {
    expect(route).toContain('title="Choose an edition"');
    expect(route).toContain("Select the exact edition in the Organizer toolbar");
  });
});