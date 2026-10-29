import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const syncRoute = readFileSync("src/routes/confirmations/admin/sync.tsx", "utf8");
const lineupServer = readFileSync("src/lib/admin-lineup.functions.ts", "utf8");

describe("V3 Organizer Confirmation line-up sync", () => {
  it("requires the exact Organizer edition instead of selecting a global/newest round", () => {
    expect(syncRoute).toContain("useAdminContext()");
    expect(syncRoute).toContain("editionId: organizerEditionId");
    expect(syncRoute).toContain("if (!organizerEditionId)");
    expect(syncRoute).toContain("row.editions?.id === organizerEditionId");
    expect(syncRoute).toContain("row.editions.id !== organizerEditionId");
    expect(syncRoute).not.toContain("b.editionNumber - a.editionNumber");
    expect(syncRoute).toContain('title="Select an edition"');
    expect(syncRoute).toContain("will not choose the newest confirmation round or another edition automatically");
  });

  it("rejects stale edition targets before applying the reviewed legacy line-up sync", () => {
    expect(syncRoute).toContain("result.editionId !== organizerEditionId");
    expect(syncRoute).toContain("selectedRound.editionId !== organizerEditionId");
    expect(syncRoute).toContain("targets.editionId !== organizerEditionId");
    expect(syncRoute).toContain("Edition context changed before the line-up review");
    expect(syncRoute).toContain("organizerEditionIdRef.current !== review.editionId");
    expect(syncRoute).toContain("liveTargets.editionId !== review.editionId");
    expect(syncRoute).toContain("The Solaris target edition no longer matches this review");
    expect(syncRoute).toContain("editionId: review.editionId, showId: review.showId, countryIds");
  });

  it("keeps the remaining line-up mutation recognizable as legacy System-owned authority", () => {
    expect(syncRoute).toContain("addCountriesToShow");
    expect(syncRoute).toContain("System #598 remains the blocker");
    expect(lineupServer).toContain("export const addCountriesToShow");
    expect(lineupServer).toContain('requireSolarisCapabilityServer("entry.edit", data.editionId)');
    expect(lineupServer).toContain('.from("participants").update');
    expect(lineupServer).toContain('.from("participants").insert');
  });
});
