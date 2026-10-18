import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";

const route = readFileSync("src/routes/televoting/admin/rounds.tsx", "utf8");
const view = readFileSync("src/components/televoting/VotingRoundsView.tsx", "utf8");
const functions = readFileSync("src/integrations/televoting/rounds.functions.ts", "utf8");

describe("V3 Organizer Voting Rounds edition boundary", () => {
  it("remounts local command state when the Organizer edition changes", () => {
    expect(route).toContain("const { editionId } = useAdminContext();");
    expect(route).toContain('<VotingRoundsView key={editionId ?? "unscoped"} />');
    expect(route).toContain("commands prepared for edition A cannot");
  });

  it("keeps the underlying rounds projection fail-closed to an explicit Solaris edition", () => {
    expect(view).toContain('queryKey: ["merged-televoting-rounds-page", editionId]');
    expect(view).toContain("enabled: Boolean(editionId)");
    expect(view).toContain("getRoundsPage({ data: { editionId } })");
    expect(functions).toContain('"admin_rounds_page_overview"');
    expect(functions).toContain("p_solaris_edition_id: data.editionId");
    expect(functions).toContain("solaris_id: solarisId");
  });

  it("keeps stale local round commands inside the keyed component boundary", () => {
    for (const state of ["createOpen", "editing", "deleteTarget", "pendingStatus"]) {
      expect(view).toContain(state);
    }
  });

  it("advances rounds and entries only to building", () => {
    const capability = V3_ORGANIZER_CAPABILITY_REGISTRY.find(
      (item) => item.legacyId === "voting-rounds-entries",
    );
    expect(capability?.targetDomain).toBe("voting-results");
    expect(capability?.migrationStatus).toBe("building");
  });
});
