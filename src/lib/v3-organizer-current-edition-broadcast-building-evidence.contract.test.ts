import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";

const route = readFileSync("src/routes/_authenticated/admin/design.$slug.tsx", "utf8");
const adapter = readFileSync("src/lib/v3-organizer-production-design.ts", "utf8");
const systemAuthority = readFileSync("src/lib/v3-production-design.ts", "utf8");
const ownership = readFileSync("src/lib/v3-organizer-route-ownership.ts", "utf8");

function capability() {
  return V3_ORGANIZER_CAPABILITY_REGISTRY.find(
    (item) => item.legacyId === "current-edition-broadcast",
  );
}

describe("V3 Organizer current-edition Broadcast building evidence", () => {
  it("reports the implemented production workspace as building without parity inflation", () => {
    expect(capability()).toBeDefined();
    expect(capability()?.migrationStatus).toBe("building");
    expect(["parity", "cutover", "retired"]).not.toContain(capability()?.migrationStatus);
    expect(capability()?.targetDomain).toBe("production");
  });

  it("keeps Broadcast routed to the canonical edition-scoped Design workspace", () => {
    expect(route).toContain('createFileRoute("/_authenticated/admin/design/$slug")');
    expect(route).toContain("useAdminContext()");
    expect(route).toContain("organizerEditionId !== edition.id");
    expect(route).toContain("Edition context changed before this Production operation");
    expect(ownership).toContain('ownerLegacyId: "current-edition-broadcast"');
    expect(ownership).toContain('routePattern: "/admin/edition-theme/*"');
  });

  it("keeps the mature editor while moving persistence behind atomic System authority", () => {
    expect(route).toContain("BroadcastEditor");
    expect(route).toContain("ScoreboardEditor");
    expect(route).toContain("ThemeEditor");
    expect(route).toContain("EditionArtworkControl");
    expect(route).toContain("prepareOrganizerProductionDesignReview");
    expect(route).toContain("commitOrganizerProductionDesignReview");
    expect(route).toContain("expectedStateVersion");
    expect(route).toContain("operationId");
    expect(route).toContain("AdminConfirmSheet");
    expect(route).toContain("applyReviewedDesign");
    expect(route).not.toContain('supabase.from("themes")');
    expect(route).not.toContain('supabase.from("shows")');
    expect(route).not.toContain('.from("editions")');
  });

  it("freezes canonical state and operation identity before human confirmation", () => {
    expect(adapter).toContain("loadProductionDesignProjection({ editionId, showId })");
    expect(adapter).toContain("createProductionDesignCommandIdentity({");
    expect(adapter).toContain("expectedStateVersion: projection.stateVersion");
    expect(adapter).toContain("current.stateVersion !== review.expectedStateVersion");
    expect(route).toContain("pendingReview.authority.expectedStateVersion");
    expect(route).toContain("pendingReview.authority.operationId");
  });

  it("does not blindly retry an uncertain Production mutation", () => {
    expect(adapter).toContain("applyProductionDesign({");
    expect(adapter).toContain("reconcileProductionDesignOperation(review.operationId)");
    expect(adapter).toContain("throw originalError");
    expect(systemAuthority).toContain('"admin_apply_production_design"');
    expect(systemAuthority).toContain('"studio2_reconcile_operation"');
  });

  it("submits the complete edition show set for one atomic default operation", () => {
    expect(route).toContain("const showConfigs: ProductionDesignShowConfig[] = editionShows.map");
    expect(route).toContain('mode: "edition_default"');
    expect(route).toContain("showConfigs,");
    expect(route).toContain("participantCountByShow.get(show.id)");
    expect(route).toContain("committed together by one atomic server operation");
  });

  it("surfaces the authoritative receipt on the post-operation success state", () => {
    expect(route).toContain("const receiptId = result.receiptId ?? result.operationId");
    expect(route).toContain("Receipt ${receiptId}.");
    expect(adapter).toContain("receiptId:");
    expect(adapter).toContain("operationId:");
  });
});
