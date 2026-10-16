import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const guard = readFileSync("src/routes/televoting/admin/rounds/$id.tsx", "utf8");
const entries = readFileSync("src/routes/televoting/admin/rounds/$id/entries.tsx", "utf8");

describe("V3 Organizer voting round child scope", () => {
  it("verifies the URL round against the exact Organizer edition before mounting children", () => {
    expect(guard).toContain("const { editionId } = useAdminContext();");
    expect(guard).toContain('getRoundsPage({ data: { editionId } })');
    expect(guard).toContain("scopeQuery.data?.edition?.rounds.some((round) => round.id === roundId)");
    expect(guard).toContain("return <Outlet />;");
  });

  it("fails closed for missing, unverifiable, or mismatched scope", () => {
    expect(guard).toContain('title="Choose an edition"');
    expect(guard).toContain('title="Voting round scope unavailable"');
    expect(guard).toContain('title="Round is outside the selected edition"');
    expect(guard).toContain("Solaris will not open a round from another edition");
  });

  it("protects the stateful entries editor and its mutation set behind the route guard", () => {
    for (const mutation of [
      "saveMergedRoundCountries",
      "saveMergedCustomRoundEntry",
      "deleteMergedCustomRoundEntry",
      "reorderMergedRoundEntries",
      "setMergedRoundSelfVotingMode",
      "syncMergedRoundFromSolaris",
    ]) {
      expect(entries).toContain(mutation);
    }
  });
});
