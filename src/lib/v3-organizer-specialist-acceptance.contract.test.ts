import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { capabilityForOrganizerPath } from "./permission-route-map";
import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";
import { V3_ORGANIZER_ACCEPTED_SPECIALIST_CUTOVERS } from "./v3-organizer-accepted-specialist-cutovers";

const eligibilityRoute = readFileSync("src/routes/_authenticated/admin/eligibility.tsx", "utf8");
const eligibilityModel = readFileSync("src/lib/studio2-eligibility.ts", "utf8");
const mediaRoute = readFileSync("src/routes/_authenticated/admin/media-assets.tsx", "utf8");
const mediaModel = readFileSync("src/lib/studio2-media-assets.ts", "utf8");
const confirmationOverview = readFileSync("src/routes/confirmations/admin/index.tsx", "utf8");
const confirmationRequirements = readFileSync("src/routes/confirmations/admin/requirements.tsx", "utf8");
const confirmationSettings = readFileSync("src/routes/confirmations/admin/settings.tsx", "utf8");
const confirmationAdmin = readFileSync("src/integrations/confirmations/admin.ts", "utf8");
const confirmationClient = readFileSync("src/integrations/confirmations/client.ts", "utf8");

describe("accepted Organizer specialist family", () => {
  it("keeps exact route capability ownership for every accepted specialist", () => {
    for (const [id, proof] of Object.entries(V3_ORGANIZER_ACCEPTED_SPECIALIST_CUTOVERS)) {
      expect(capabilityForOrganizerPath(proof.route)).toBe(proof.owner);
      const registry = V3_ORGANIZER_CAPABILITY_REGISTRY.find((row) => row.legacyId === id);
      expect(registry?.ownerCapability).toBe(proof.owner);
      expect(registry?.migrationStatus).toBe("cutover");
      expect(registry?.migrationEvidence).toContain("v3-organizer-specialist-acceptance.contract.test.ts");
    }
  });

  it("accepts Eligibility only because browser writes are absent and governed R2 preview/apply owns mutation", () => {
    expect(eligibilityRoute).toContain("loadStudio2CountryCockpit(resolvedEditionId)");
    expect(eligibilityRoute).not.toContain(".insert(");
    expect(eligibilityRoute).not.toContain(".update(");
    expect(eligibilityRoute).not.toContain(".delete(");
    expect(eligibilityModel).toContain("studio2_eligibility_override_change_preview");
    expect(eligibilityModel).toContain("studio2_apply_eligibility_override_change");
    expect(eligibilityModel).toContain("expectedVersion");
    expect(eligibilityModel).toContain("operationId");
  });

  it("accepts Media assets only through its canonical review owner and without route-level table writes", () => {
    expect(mediaRoute).not.toContain(".insert(");
    expect(mediaRoute).not.toContain(".update(");
    expect(mediaRoute).not.toContain(".delete(");
    expect(mediaModel).toContain("studio2_media_asset_reviews");
    expect(mediaModel).toContain("studio2_review_media_assets");
  });

  it("accepts the non-destructive Confirmation overview and requirements reads under the canonical confirmation owner", () => {
    expect(`${confirmationOverview}\n${confirmationAdmin}\n${confirmationClient}`).toContain("admin_confirmation_responses");
    expect(`${confirmationRequirements}\n${confirmationAdmin}`).toContain("admin_confirmation_requirements");
    expect(confirmationAdmin).toContain("admin_confirmation_editions");
  });

  it("accepts Confirmation settings only while retaining server RPC ownership and no direct browser writes", () => {
    for (const source of [confirmationSettings, confirmationAdmin, confirmationClient]) {
      expect(source).not.toContain(".insert(");
      expect(source).not.toContain(".update(");
      expect(source).not.toContain(".delete(");
    }
    for (const rpc of [
      "admin_confirmation_save_edition",
      "admin_confirmation_set_edition_editing",
      "admin_confirmation_save_round",
      "admin_confirmation_set_round_status",
      "admin_confirmation_set_round_editing",
      "studio2_confirmation_round_change_preview",
      "studio2_apply_confirmation_round_change",
    ]) expect(`${confirmationSettings}\n${confirmationAdmin}\n${confirmationClient}`).toContain(rpc);
  });

  it("does not promote known mutation-gap families through this acceptance set", () => {
    for (const id of [
      "operations-communications",
      "live-review-broadcast-rundown",
      "delegation-confirmation-responses",
      "delegation-sync",
      "voting-rounds-entries",
      "voting-public-results",
    ]) expect(V3_ORGANIZER_CAPABILITY_REGISTRY.find((row) => row.legacyId === id)?.migrationStatus).toBe("building");
  });
});
