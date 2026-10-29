import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { capabilityForOrganizerPath } from "./permission-route-map";
import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";
import { V3_ORGANIZER_ACCEPTED_SPECIALIST_CUTOVERS } from "./v3-organizer-accepted-specialist-cutovers";

const countriesRoute = readFileSync("src/routes/_authenticated/admin/countries.tsx", "utf8");
const countryCockpit = readFileSync("src/lib/studio2-country-cockpit.ts", "utf8");
const votingRoute = readFileSync("src/routes/televoting/admin/index.tsx", "utf8");
const votingOverview = readFileSync("src/integrations/televoting/admin-data.functions.ts", "utf8");
const declarationsRoute = readFileSync("src/routes/televoting/admin/integrity-declarations.tsx", "utf8");
const declarationAdmin = readFileSync("src/lib/voting-declaration-admin.ts", "utf8");
const declarationMigration = readFileSync("supabase/migrations/20261018122500_v3_voting_declaration_expected_edition_scope.sql", "utf8");
const juryIntegrityRoute = readFileSync("src/routes/_authenticated/admin/jury-integrity.tsx", "utf8");
const juryIntegrityServer = readFileSync("src/integrations/jury-voting/jury-integrity-admin.server.ts", "utf8");
const eligibilityRoute = readFileSync("src/routes/_authenticated/admin/eligibility.tsx", "utf8");
const eligibilityModel = readFileSync("src/lib/studio2-eligibility.ts", "utf8");
const mediaRoute = readFileSync("src/routes/_authenticated/admin/media-assets.tsx", "utf8");
const mediaModel = readFileSync("src/lib/studio2-media-assets.ts", "utf8");
const timeMachineRoute = readFileSync("src/routes/_authenticated/admin/time-machine.tsx", "utf8");
const commandAssistantRoute = readFileSync("src/routes/_authenticated/admin/command-assistant.tsx", "utf8");
const publicUxRoute = readFileSync("src/routes/_authenticated/admin/public-ux.tsx", "utf8");
const publicUxMetrics = readFileSync("src/lib/public-ux-metrics.ts", "utf8");
const beta3Route = readFileSync("src/routes/_authenticated/admin/beta3-feedback.tsx", "utf8");
const beta2Route = readFileSync("src/routes/_authenticated/admin/beta2-feedback.tsx", "utf8");
const beta1Route = readFileSync("src/routes/_authenticated/admin/beta1-feedback.tsx", "utf8");
const qaCoverage = readFileSync("src/components/admin/AdminQaCoveragePage.tsx", "utf8");
const acceptanceTest = readFileSync("src/routes/_authenticated/admin/beta-test.tsx", "utf8");
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

  it("accepts Delegations only as an exact-edition cockpit projection", () => {
    expect(countriesRoute).toContain("selectOrganizerEdition(editions, editionId)");
    expect(countriesRoute).toContain("['studio2-country-cockpit', resolvedEditionId || 'none']");
    expect(countriesRoute).toContain("loadStudio2CountryCockpit(resolvedEditionId)");
    expect(countriesRoute).not.toContain("useMutation(");
    expect(countryCockpit).toContain("Country cockpit requires an explicit edition scope.");
    expect(countryCockpit).toContain("p_edition_id: normalizedEditionId");
    expect(countryCockpit).toContain("row.context.editionId !== normalizedEditionId");
    expect(countryCockpit).toContain("duplicate country rows for the selected edition");
  });

  it("accepts Voting overview only through server authorization and exact Organizer edition scope", () => {
    expect(votingRoute).toContain("const { editionId, editionSlug } = useAdminContext()");
    expect(votingRoute).toContain('["merged-televoting-admin-overview", editionId ?? "none"]');
    expect(votingRoute).toContain("getOverview({ data: { editionId: editionId! } })");
    expect(votingRoute).not.toContain("useMutation(");
    expect(votingOverview).toContain("await requireMergedTelevotingAdminServer()");
    expect(votingOverview).toContain('"admin_overview_summary"');
    expect(votingOverview).toContain("p_solaris_edition_id: data.editionId");
  });

  it("accepts declaration evidence only with exact-edition read validation and governed R2 invalidation", () => {
    expect(declarationsRoute).toContain('["merged-integrity-declarations", editionId]');
    expect(declarationsRoute).toContain("row.canonical_edition_id !== editionId");
    expect(declarationsRoute).toContain("operationId = crypto.randomUUID()");
    expect(declarationAdmin).toContain('command: "integrity.declaration.invalidate"');
    expect(declarationAdmin).toContain('riskClass: "R2"');
    expect(declarationAdmin).toContain("expectedVersion: input.preview.declarationVersion");
    expect(declarationAdmin).toContain("p_expected_edition_id: editionId");
    expect(declarationMigration).toContain("v_actual_edition_id is distinct from p_expected_edition_id");
    expect(declarationMigration).toContain("v_row.declaration_version is distinct from p_expected_version");
    expect(declarationMigration).toContain("private.studio2_claim_operation(");
    expect(declarationMigration).toContain("private.studio2_complete_operation(v_operation_id, v_result)");
  });

  it("accepts Jury integrity only as bounded server-authorized evidence for the exact edition", () => {
    expect(juryIntegrityRoute).toContain('["jury-integrity-v5", editionId ?? "unscoped"]');
    expect(juryIntegrityRoute).toContain("row.editionId !== editionId");
    expect(juryIntegrityRoute).not.toContain("useMutation(");
    expect(juryIntegrityServer).toContain("await requireMergedTelevotingAdminServer()");
    expect(juryIntegrityServer).toContain('.eq("canonical_edition_id", scopedEditionId)');
    expect(juryIntegrityServer).toContain('.limit(1000)');
    expect(juryIntegrityServer).toContain("evidence outside the selected edition scope");
    expect(juryIntegrityServer).toContain('.eq("edition_id", scopedEditionId).in("id", showIds)');
  });

  it("accepts Time Machine only as a bounded exact-edition historical read", () => {
    expect(timeMachineRoute).toContain('rpc("studio2_time_machine"');
    expect(timeMachineRoute).toContain("_edition_id: editionId");
    expect(timeMachineRoute).toContain('["time-machine", editionId ?? "none", asOf]');
    expect(timeMachineRoute).toContain("TIME_MACHINE_EVENT_LIMIT = 250");
    expect(timeMachineRoute).toContain("TIME_MACHINE_AUDIT_LIMIT = 100");
    expect(timeMachineRoute).not.toContain("useMutation(");
  });

  it("accepts Command Assistant only as exact-edition read-only navigation", () => {
    expect(commandAssistantRoute).toContain("const { editionId } = useAdminContext()");
    expect(commandAssistantRoute).toContain("edition.id === editionId");
    expect(commandAssistantRoute).toContain("useV3OrganizerProjection(resolvedEditionId || null)");
    expect(commandAssistantRoute).toContain("cannot generate arbitrary SQL");
    expect(commandAssistantRoute).not.toContain("useMutation(");
  });

  it("accepts Public UX only through bounded aggregate telemetry reads", () => {
    expect(publicUxRoute).toContain('["admin-public-ux-metrics", days]');
    expect(publicUxRoute).toContain('["admin-public-web-vitals", days]');
    expect(publicUxRoute).not.toContain("useMutation(");
    expect(publicUxMetrics).toContain('client.rpc("admin_public_ux_metrics"');
    expect(publicUxMetrics).toContain('client.rpc("admin_public_web_vitals"');
    expect(publicUxMetrics).toContain("Math.max(1, Math.min(180");
    expect(publicUxMetrics).toContain("sanitizePublicUxPath");
    expect(publicUxMetrics).toContain("sanitizePublicUxTarget");
  });

  it("accepts historical Beta feedback surfaces only as read-only restricted analysis", () => {
    for (const source of [beta3Route, beta2Route, beta1Route]) {
      expect(source).toContain(".select(");
      expect(source).not.toContain(".insert(");
      expect(source).not.toContain(".update(");
      expect(source).not.toContain(".delete(");
      expect(source).not.toContain("useMutation(");
    }
    expect(beta1Route).toContain("Beta 1 is closed");
    expect(beta1Route).toContain('.eq("form_version", 2)');
    expect(beta2Route).toContain('from("beta2_test_submissions"');
    expect(beta3Route).toContain('from("beta3_test_submissions"');
  });

  it("accepts QA Coverage as read-only evidence while keeping governed submission pending runtime promotion", () => {
    expect(qaCoverage).toContain('from("admin_beta_test_submissions"');
    expect(qaCoverage).toContain(".select(");
    expect(qaCoverage).toContain("createSignedUrl");
    expect(qaCoverage).not.toContain(".insert(");
    expect(qaCoverage).not.toContain(".update(");
    expect(qaCoverage).not.toContain(".delete(");
    expect(acceptanceTest).toContain("submitOrganizerAcceptanceEvidence");
    expect(acceptanceTest).toContain("submissionOperationRef");
    expect(acceptanceTest).not.toContain('from("admin_beta_test_submissions"');
    expect(acceptanceTest).not.toContain(".insert(");
    expect(V3_ORGANIZER_CAPABILITY_REGISTRY.find((row) => row.legacyId === "workspace-acceptance-test")?.migrationStatus).toBe("building");
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
    expect(mediaRoute).not.toContain(".from(");
    expect(mediaRoute).not.toContain("supabase");
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
      "workspace-acceptance-test",
    ]) expect(V3_ORGANIZER_CAPABILITY_REGISTRY.find((row) => row.legacyId === id)?.migrationStatus).toBe("building");
  });
});
