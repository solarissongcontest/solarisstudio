import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const guard = readFileSync("src/routes/televoting/admin/rounds/$id.tsx", "utf8");
const entries = readFileSync("src/routes/televoting/admin/rounds/$id/entries.tsx", "utf8");

describe("V3 Organizer voting round child scope", () => {
  it("verifies the URL round against the exact Organizer edition before mounting children", () => {
    expect(guard).toContain("const { editionId, editionLabel } = useAdminContext();");
    expect(guard).toContain('getRoundsPage({ data: { editionId } })');
    expect(guard).toContain("scopeEdition.solaris_id === editionId");
    expect(guard).toContain("scopeEdition?.rounds.find((round) => round.id === roundId)");
    expect(guard).toContain('data-v3-organizer-context-lock="edition-round"');
    expect(guard).toContain("<Outlet />");
  });

  it("fails closed for missing, unverifiable or mismatched scope", () => {
    expect(guard).toContain('title="Choose an edition"');
    expect(guard).toContain('title="Voting round scope unavailable"');
    expect(guard).toContain('title="Round is outside the selected edition"');
    expect(guard).toContain("Solaris will not expose another edition's round editor");
  });

  it("protects the stateful entries mutation set behind the parent route guard", () => {
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