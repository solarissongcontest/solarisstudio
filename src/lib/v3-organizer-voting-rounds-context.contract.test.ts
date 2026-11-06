import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";

const route = readFileSync("src/routes/televoting/admin/rounds.tsx", "utf8");
const view = readFileSync("src/components/televoting/VotingRoundsView.tsx", "utf8");
const functions = readFileSync("src/integrations/televoting/rounds.functions.ts", "utf8");

describe("V3 Organizer Voting Rounds edition boundary", () => {
  it("remounts local command state when the Organizer edition changes", () => {
    expect(route).toContain("const { editionId } = useAdminContext();");
    expect(route).toContain('const actorId = useAuthenticatedUser().id');
    expect(route).toContain('<VotingRoundsView key={`${actorId}:${editionId ?? "unscoped"}`} />');
    expect(route).toContain("commands prepared");
  });

  it("keeps the underlying rounds projection fail-closed to an explicit Solaris edition", () => {
    expect(view).toContain('queryKey: ["merged-televoting-rounds-page", actorId, editionId]');
    expect(view).toContain("enabled: Boolean(actorId && editionId)");
    expect(view).toContain("getRoundsPage({ data: { editionId } })");
    expect(functions).toContain('"admin_rounds_page_overview"');
    expect(functions).toContain("p_solaris_edition_id: data.editionId");
    expect(functions).toContain("solaris_id: solarisId");
  });

  it("does not reuse another Organizer account's protected round projection", () => {
    expect(view).toContain("const actorId = useAuthenticatedUser().id");
    expect(view).toContain("gcTime: 0");
    expect(view).toContain("retry: false");
    expect(view).toContain("refetchInterval: false");
    expect(view).toContain("refetchOnWindowFocus: false");
    expect(view).toContain("refetchOnReconnect: false");
    expect(view).toContain('queryClient.invalidateQueries({ queryKey: ["merged-televoting-rounds-page", actorId, editionId] })');
    expect(view).toContain("Retry voting rounds");
    expect(route).toContain("authenticated actor changes");
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
