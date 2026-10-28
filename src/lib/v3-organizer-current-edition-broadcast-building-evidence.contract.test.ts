import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";

const route = readFileSync("src/routes/_authenticated/admin/design.$slug.tsx", "utf8");
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
    expect(route).toContain("Edition context changed before this Production save");
    expect(ownership).toContain('ownerLegacyId: "current-edition-broadcast"');
    expect(ownership).toContain('routePattern: "/admin/edition-theme/*"');
  });

  it("has real production editing and reviewed persistence rather than a placeholder", () => {
    expect(route).toContain("BroadcastEditor");
    expect(route).toContain("ScoreboardEditor");
    expect(route).toContain("ThemeEditor");
    expect(route).toContain("EditionArtworkControl");
    expect(route).toContain('supabase.from("themes").update');
    expect(route).toContain('.from("editions")');
    // Original invariant: the reviewed edition theme must actually persist.
    // The replacement command adds exact prior-theme CAS and receipt validation.
    expect(route).toContain("await applyEditionThemeChange({");
    expect(route).toContain("editionId: review.editionId");
    expect(route).toContain("expectedThemeId: review.editionThemeId");
    expect(route).toContain("themeId,");
    const command = readFileSync("src/lib/edition-theme-command.ts", "utf8");
    expect(command).toContain('client.rpc("v3_apply_edition_theme_change", args)');
    expect(command).toContain("p_expected_theme_id: input.expectedThemeId");
    expect(command).toContain("!response.data.operationId");
    expect(route).not.toMatch(/\.from\("editions"\)\s*\.update/);
    expect(route).toContain('supabase.from("shows").update');
    expect(route).toContain("AdminConfirmSheet");
    expect(route).toContain("applyReviewedDesign");
  });

  it("does not pretend current direct table persistence is canonical parity authority", () => {
    expect(route).not.toContain("studio2_apply_operation");
    expect(route).not.toContain("operationId");
    expect(route).not.toContain("idempotencyKey");
    expect(capability()?.migrationStatus).not.toBe("parity");
  });
});
