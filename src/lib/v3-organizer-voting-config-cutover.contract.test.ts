import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const route = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/voting-system/$slug.tsx"),
  "utf8",
);
const authority = readFileSync(
  resolve(process.cwd(), "src/lib/v3-organizer-voting-config-authority.ts"),
  "utf8",
);
const systemAuthority = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261024235500_v3_voting_configuration_authority_current_main.sql",
  ),
  "utf8",
);

describe("V3 Organizer voting configuration cutover", () => {
  it("consumes the canonical current-main System snapshot, preflight and versioned apply contract", () => {
    expect(authority).toContain('"studio2_voting_config_snapshot"');
    expect(authority).toContain('"studio2_voting_config_preflight"');
    expect(authority).toContain('"studio2_apply_voting_config_change"');
    expect(authority).toContain("p_expected_version: input.expectedVersion");
    expect(route).toContain("fetchOrganizerVotingConfigSnapshot");
    expect(route).toContain("preflightOrganizerVotingConfigChange");
    expect(route).toContain("applyOrganizerVotingConfigChange");

    expect(systemAuthority).toContain("'v3.voting.configuration-authority'");
    expect(systemAuthority).toContain("create or replace function public.studio2_voting_config_snapshot(");
    expect(systemAuthority).toContain("create or replace function public.studio2_voting_config_preflight(");
    expect(systemAuthority).toContain("create or replace function public.studio2_apply_voting_config_change(");
    expect(systemAuthority).not.toContain("'20261019231500_v3_versioned_voting_config'");
    expect(systemAuthority).not.toContain("'20261019231600_v3_voting_config_preflight_risk_closure'");
  });

  it("removes the legacy browser-owned voting and Results mutation path", () => {
    expect(route).not.toContain('supabase.from("shows")');
    expect(route).not.toContain('supabase.from("results")');
    expect(route).not.toContain("rerankExistingResults");
    expect(route).not.toContain("useJuryVotes");
    expect(route).not.toContain("useTelevotes");
    expect(route).not.toContain("results.final_rank");
    expect(route).toContain("It will not recalculate or publish results as a hidden side effect.");
  });

  it("fails closed on edition and explicit show context drift", () => {
    expect(route).toContain("useAdminContext()");
    expect(route).toContain("organizerEditionId !== edition.id");
    expect(route).toContain("staleShowSelection");
    expect(route).toContain("Solaris will not silently substitute another show.");
    expect(authority).toContain("snapshot.editionId !== input.editionId || snapshot.showId !== input.showId");
    expect(authority).toContain("preflight.editionId !== input.editionId || preflight.showId !== input.showId");
    expect(authority).toContain("result.operationId !== input.operationId");
    expect(authority).toContain("result.editionId !== input.editionId");
    expect(authority).toContain("result.showId !== input.showId");
  });

  it("binds review to the version actually shown and allocates canonical identity before confirmation", () => {
    expect(route).toContain("preflight.expectedVersion !== snapshot.version");
    expect(route).toContain("expectedVersion: preflight.expectedVersion");
    expect(route).toContain('command: "voting.configure"');
    expect(route).toContain('riskClass: "R2"');
    expect(route).toContain("operationId: command.operationId");
    expect(route).toContain("idempotencyKey: command.idempotencyKey");
    expect(route).toContain("expectedVersion: review.expectedVersion");
    expect(route).toContain("operationId: review.operationId");
    expect(route).toContain("idempotencyKey: review.idempotencyKey");
    expect(route).toContain("configuration version and voting/result evidence at commit time");
    expect(systemAuthority).toContain("'voting.configure','R2'");
  });

  it("treats official voting/result evidence as a hard freeze rather than a recalculation prompt", () => {
    expect(route).toContain('preflight.riskClass === "blocked"');
    expect(route).toContain("Voting configuration is frozen because official voting or result evidence now exists");
    expect(systemAuthority).toContain("private.v3_voting_config_change_blocked");
    expect(systemAuthority).toContain("message = 'DEPENDENCY_FAILURE'");
    expect(systemAuthority).toContain("when v_blocked then 'blocked'");
    expect(systemAuthority).toContain("else 'R2'");
  });

  it("keeps one reviewed operation identity across an uncertain apply/reconciliation outcome", () => {
    expect(route).toContain("outcomeUncertain: boolean");
    expect(route).toContain("review.outcomeUncertain");
    expect(route).toContain("recoverApply(review.operationId, edition.id, review.showId)");
    expect(route).toContain("current.operationId === review.operationId");
    expect(route).toContain("{ ...current, outcomeUncertain: true }");
    expect(route).toContain("retry this review to reconcile that same operation instead of creating another");
    expect(route).toContain("if (!busy && !pendingSave?.outcomeUncertain) setPendingSave(null)");
    expect(route).toContain("Reconcile same operation");
    expect(route).not.toContain('command: "voting.config.update"');
  });

  it("distinguishes authoritative failure from still-unresolved reconciliation", () => {
    expect(route).toContain('state: "failed"');
    expect(route).toContain('state: "unresolved"');
    expect(route).toContain('reconciliation.receipt.status === "failed"');
    expect(route).toContain('reconciliation.receipt.status !== "succeeded"');
    expect(route).toContain("preserveReviewedOperation = false");
    expect(route).toContain("preserveReviewedOperation = true");
  });

  it("surfaces both canonical receipt and operation identity after success", () => {
    expect(route).toContain("receiptId: result.receiptId");
    expect(route).toContain("Receipt {receipt.receiptId}");
    expect(route).toContain("Operation {receipt.operationId}");
    expect(route).toContain("Confirmed from the canonical operation ledger after an uncertain response.");
    expect(authority).toContain("receiptId: asString(record, \"receiptId\"");
  });

  it("preserves compatibility metadata instead of replacing the canonical config with a client-only subset", () => {
    expect(route).toContain("mergeVotingConfigWithCompatibilityMetadata(snapshot.config, draft)");
    expect(authority).toContain("...authoritativeConfig");
    expect(authority).toContain("...draft");
    expect(authority).toContain("...existingWeighting");
    expect(authority).toContain("...draft.weighting");
  });

  it("does not re-fetch Results as a fake consequence of a config-only command", () => {
    expect(route).toContain('qc.invalidateQueries({ queryKey: ["shows"] })');
    expect(route).toContain('qc.invalidateQueries({ queryKey: ["show"] })');
    expect(route).not.toContain('qc.invalidateQueries({ queryKey: ["results"] })');
    expect(systemAuthority).not.toContain("sync_show_results_from_votes");
    expect(systemAuthority).not.toContain("studio2_apply_result");
    expect(systemAuthority).not.toContain("studio2_apply_show_publication");
  });
});
