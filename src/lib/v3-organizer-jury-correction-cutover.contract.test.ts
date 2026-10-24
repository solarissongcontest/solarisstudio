import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const route = source("src/routes/_authenticated/admin/jury/$slug.tsx");
const adapter = source("src/lib/v3-organizer-jury-correction-authority.ts");
const authority = source(
  "supabase/migrations/20261024234500_v3_jury_vote_correction_authority_current_main.sql",
);

describe("V3 Organizer Jury correction cutover", () => {
  it("consumes only the current canonical System preview and apply authority", () => {
    expect(adapter).toContain('"studio2_jury_vote_correction_preview"');
    expect(adapter).toContain('"studio2_apply_jury_vote_correction"');
    expect(route).toContain("previewOrganizerJuryCorrection");
    expect(route).toContain("applyOrganizerJuryCorrection");
    expect(authority).toContain("create or replace function public.studio2_apply_jury_vote_correction(");
    expect(authority).toContain("create or replace function public.studio2_jury_vote_correction_preview(");
  });

  it("removes raw score mutations from the Organizer route while System reuses hardened semantic primitives", () => {
    expect(route).not.toContain('rpc("assign_jury_vote"');
    expect(route).not.toContain('rpc("clear_jury_point"');
    expect(authority).toContain("v_vote_id := public.assign_jury_vote(");
    expect(authority).toContain("v_deleted := public.clear_jury_point(");
  });

  it("binds commit to exact edition, show, correction version and ballot state hash", () => {
    expect(adapter).toContain("p_edition_id: input.editionId");
    expect(adapter).toContain("p_show_id: input.showId");
    expect(adapter).toContain("p_expected_version: input.expectedVersion");
    expect(adapter).toContain("p_expected_state_hash: input.expectedStateHash");
    expect(route).toContain("edition.id !== pending.editionId || selectedShow.id !== pending.showId");
    expect(route).toContain("expectedVersion: pending.preview.version");
    expect(route).toContain("expectedStateHash: pending.preview.stateHash");
    expect(authority).toContain("or v_current_hash is distinct from p_expected_state_hash");
    expect(authority).toContain("raise exception 'VERSION_CONFLICT'");
  });

  it("requires an explicit R2 review and operator reason before official score mutation", () => {
    expect(route).toContain('riskClass: preview.riskClass');
    expect(route).toContain('command: action === "assign" ? "jury.vote.correct" : "jury.vote.clear"');
    expect(route).toContain("correctionReason.trim()");
    expect(route).toContain("if (reason.length < 5) return;");
    expect(route).toContain('confirmationText="APPLY"');
    expect(route).toContain("Why is this official Jury score changing?");
    expect(authority).toContain("char_length(v_reason) < 5");
  });

  it("shows structured blockers instead of attempting an invalid score write", () => {
    expect(adapter).toContain("parseBlockers");
    expect(route).toContain("!preview.canApply || preview.blockers.length");
    expect(route).toContain("juryCorrectionBlockerMessage(preview)");
    for (const code of [
      "JURY_DID_NOT_VOTE",
      "BALLOT_NOT_ACTIVE",
      "TARGET_NOT_IN_SHOW",
      "POINT_VALUE_NOT_CONFIGURED",
      "SELF_VOTE",
      "RESULTS_PROTECTED",
    ]) {
      expect(authority).toContain(`'${code}'`);
    }
  });

  it("retains one operation identity across a compound transport and reconciliation outage", () => {
    expect(adapter).toContain("unresolvedOperationByScope");
    expect(adapter).toContain("correctionScopeKey");
    expect(adapter).toContain("correctionFingerprint");
    expect(adapter).toContain("if (existing.fingerprint !== fingerprint)");
    expect(adapter).toContain("return { scopeKey, fingerprint, ...existing }");
    expect(adapter).toContain("p_operation_id: retained.operationId");
    expect(adapter).toContain("p_idempotency_key: retained.idempotencyKey");
    expect(adapter).toContain("p_correlation_id: retained.correlationId");
    expect(adapter).toContain("if (!systemError.retryable)");
    expect(adapter).toContain("clearRetainedOperation(retained.scopeKey, retained.fingerprint)");
    expect(route).toContain("reconcileSystemOperation");
  });

  it("refuses a different correction intent while the exact Jury point operation remains unresolved", () => {
    expect(adapter).toContain("A previous correction for this Jury point is still unresolved");
    expect(adapter).toContain("reason: input.reason.trim()");
    expect(adapter).toContain("expectedVersion: input.expectedVersion");
    expect(adapter).toContain("expectedStateHash: input.expectedStateHash");
    expect(adapter).toContain("receivingCountryId: input.receivingCountryId");
    expect(adapter).toContain("receivingEntityId: input.receivingEntityId");
  });

  it("surfaces Results invalidation as an explicit cross-domain consequence", () => {
    expect(route).toContain("pendingCorrection.preview.results.recalculationRequiredIfApplied");
    expect(route).toContain("Results must then be recalculated through the Results workspace");
    expect(route).toContain("result.resultsRecalculationRequired");
    expect(route).toContain('qc.invalidateQueries({ queryKey: ["results"] })');
    expect(route).toContain("Recalculate in Results before review or publication.");
    expect(authority).toContain("resultsRecalculationRequired");
    expect(authority).not.toContain("delete from private.v3_result_versions");
  });

  it("leaves neighboring governed Jury lifecycles intact", () => {
    expect(route).toContain('lifecycleRpc("studio2_jury_dnv_preview"');
    expect(route).toContain('lifecycleRpc("studio2_apply_jury_dnv"');
    expect(route).toContain('lifecycleRpc("studio2_jury_ballot_review_preview"');
    expect(route).toContain('lifecycleRpc("studio2_apply_jury_ballot_review"');
    expect(route).toContain('supabase.from("voters")');
  });
});
