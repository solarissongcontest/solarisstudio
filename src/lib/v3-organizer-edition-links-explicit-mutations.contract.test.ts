import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";

const route = readFileSync("src/routes/confirmations/admin/editions.tsx", "utf8");
const client = readFileSync("src/lib/v3-confirmation-edition-authority.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20261020090000_v3_confirmation_edition_authority.sql",
  "utf8",
);

describe("V3 Organizer Confirmation edition-link mutation boundaries", () => {
  it("keeps opening the edition-links page observational and exact-context", () => {
    expect(route).toContain("useAdminContext()");
    expect(route).toContain("loadConfirmationEditionAuthority(editionId)");
    expect(route).toContain("Select an Organizer edition");
    expect(route).toContain("no active/newest-edition fallback");
    expect(route).not.toContain("synchronize(false)");
    expect(route).not.toContain('.from("integration_links")');
  });

  it("requires explicit governed review before binding repair", () => {
    expect(route).toContain("Review binding repair");
    expect(route).toContain("previewConfirmationEditionLinkRepair(editionId)");
    expect(route).toContain("applyConfirmationEditionLinkRepair(pendingLink)");
    expect(route).toContain("The server refuses reverse/cross-edition rebinding");
    expect(migration).toContain("Confirmation remote identity is already bound to another Solaris edition");
    expect(migration).toContain("private.studio2_claim_operation(");
  });

  it("reviews edition-wide editing changes and rechecks binding + CAS at apply", () => {
    expect(route).toContain("previewConfirmationEditionEditing(editionId, targetEnabled)");
    expect(route).toContain("applyConfirmationEditionEditing(pendingEditing)");
    expect(route).toContain("authority revision");
    expect(client).toContain("p_expected_remote_id: preview.expectedRemoteId");
    expect(client).toContain("p_expected_version: preview.stateVersion");
    expect(migration).toContain("v_link.remote_id is distinct from p_expected_remote_id");
    expect(migration).toContain("v_version is distinct from p_expected_version");
  });

  it("records the governed System #702 implementation without self-promoting registry parity", () => {
    const capability = V3_ORGANIZER_CAPABILITY_REGISTRY.find(
      (item) => item.legacyId === "delegation-edition-links",
    );

    expect(capability).toBeDefined();
    expect(capability?.migrationStatus).toBe("building");
    expect(["parity", "cutover", "retired"]).not.toContain(capability?.migrationStatus);
    expect(migration).toContain("v3.confirmation.edition-authority");
    expect(client).toContain('"studio2_reconcile_operation"');
    expect(route).not.toContain("saveConfirmationEdition");
    expect(route).not.toContain("setConfirmationEditionEditing");
  });
});
