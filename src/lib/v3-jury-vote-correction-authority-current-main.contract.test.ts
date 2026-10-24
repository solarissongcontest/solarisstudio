import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20261024234500_v3_jury_vote_correction_authority_current_main.sql";
const migration = readFileSync(resolve(process.cwd(), migrationPath), "utf8");

function functionBlock(name: string) {
  const marker = `create or replace function ${name}`;
  const start = migration.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = migration.indexOf("create or replace function", start + marker.length);
  return migration.slice(start, next === -1 ? migration.length : next);
}

describe("V3 current-main Organizer Jury vote correction authority", () => {
  it("uses one fresh semantic S13 migration contract instead of stale filename-shaped registrations", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("'v3.jury.vote-correction-authority'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).not.toContain("'20261019223000_v3_jury_vote_correction_authority'");
    expect(migration).not.toContain("'20261019223100_v3_jury_correction_preflight_blockers'");
    expect(migration).not.toContain("'20261019223200_v3_jury_correction_publication_guard'");
  });

  it("keeps exact Jury object scope, capability and configured score authority server-side", () => {
    expect(migration).toContain("private.v3_assert_jury_vote_object_scope(");
    expect(migration).toContain("studio2_access_allowed('jury.ballots.manage'");
    expect(migration).toContain("studio2_jury_correction_target_valid");
    expect(migration).toContain("studio2_jury_correction_points_valid");
    expect(migration).toContain("A Jury cannot assign points to its own entry.");
    expect(migration).toContain("coalesce(participant.participation_status, 'confirmed') = 'confirmed'");
  });

  it("returns structured preflight blockers and exact current assignment", () => {
    const preview = functionBlock("public.studio2_jury_vote_correction_preview");
    expect(preview).toContain("'currentPointAssignment'");
    expect(preview).toContain("'blockers', v_blockers");
    expect(preview).toContain("'canApply', jsonb_array_length(v_blockers) = 0");
    expect(preview).toContain("'JURY_DID_NOT_VOTE'");
    expect(preview).toContain("'BALLOT_NOT_ACTIVE'");
    expect(preview).toContain("'TARGET_NOT_IN_SHOW'");
    expect(preview).toContain("'POINT_VALUE_NOT_CONFIGURED'");
    expect(preview).toContain("'SELF_VOTE'");
    expect(preview).toContain("'RESULTS_PROTECTED'");
    expect(preview).toContain("'stateVersion'");
    expect(preview).toContain("'recalculationRequiredIfApplied'");
  });

  it("claims before mutable-state validation so a committed lost response can replay after later state drift", () => {
    const apply = functionBlock("public.studio2_apply_jury_vote_correction");
    const claim = apply.indexOf("v_claim := private.studio2_claim_operation(");
    const replay = apply.indexOf("if coalesce((v_claim ->> 'replayed')::boolean, false)");
    const resultLock = apply.indexOf("hashtextextended('studio2-results:' || p_show_id::text, 0)");
    const mutableGuard = apply.indexOf("perform private.studio2_jury_correction_assert_available(");
    expect(claim).toBeGreaterThanOrEqual(0);
    expect(replay).toBeGreaterThan(claim);
    expect(resultLock).toBeGreaterThan(replay);
    expect(mutableGuard).toBeGreaterThan(resultLock);
    expect(apply).toContain("return public.studio2_reconcile_operation");
    expect(apply).toContain("'jury.vote.correct'");
    expect(apply).toContain("'jury.vote.clear'");
    expect(apply).toContain("'R2'");
  });

  it("uses correction version plus source-state fingerprint CAS", () => {
    const apply = functionBlock("public.studio2_apply_jury_vote_correction");
    expect(migration).toContain("private.studio2_jury_correction_versions");
    expect(apply).toContain("p_expected_version");
    expect(apply).toContain("p_expected_state_hash");
    expect(apply).toContain("v_current_hash := private.studio2_jury_correction_state_hash");
    expect(apply).toContain("VERSION_CONFLICT");
    expect(apply).toContain("for update;");
  });

  it("serializes with Results and blocks corrections once official outcome publication is protected", () => {
    expect(migration).toContain("'studio2-results:' || p_show_id::text");
    expect(migration).toContain("studio2_jury_correction_results_protected");
    expect(migration).toContain("operation.locked_version is not null");
    expect(migration).toContain("operation.reveal_ready_version is not null");
    expect(migration).toContain("control.state in ('scheduled', 'public')");
    expect(migration).toContain("private.studio2_publication_has_outcomes(control.frozen_config)");
    expect(migration).toContain("show_row.publication_config -> 'qualifiers' = 'true'::jsonb");
    expect(migration).toContain("show_row.publication_config -> 'jury_results' = 'true'::jsonb");
    expect(migration).toContain("Results must be corrected through the Results correction lifecycle");
  });

  it("invalidates only mutable calculated Results and preserves immutable historical snapshots", () => {
    expect(migration).toContain("delete from public.results result");
    expect(migration).toContain("reviewed_version = null");
    expect(migration).toContain("locked_version = null");
    expect(migration).toContain("reveal_ready_version = null");
    expect(migration).toContain("'invalidatedResultRows'");
    expect(migration).toContain("'resultsRecalculationRequired'");
    expect(migration).not.toContain("delete from private.v3_result_versions");
    expect(migration).not.toContain("update private.v3_result_versions");
  });

  it("emits canonical Jury consequences without spreading the free-form operator reason", () => {
    const apply = functionBlock("public.studio2_apply_jury_vote_correction");
    const eventStart = apply.indexOf("v_event_id := private.v3_emit_domain_event(");
    const auditStart = apply.indexOf("insert into public.admin_audit_log", eventStart);
    const eventBlock = apply.slice(eventStart, auditStart);
    expect(eventBlock).toContain("'jury.ballot_changed'");
    expect(eventBlock).toContain("array['jury.tasks']::text[]");
    expect(eventBlock).not.toContain("'reason', v_reason");
    expect(apply.slice(auditStart)).toContain("'reason', v_reason");
  });

  it("keeps the browser execution boundary authenticated and durable", () => {
    expect(migration).toContain("revoke all on function public.studio2_apply_jury_vote_correction(");
    expect(migration).toContain(") to authenticated;");
    expect(migration).toContain("return private.studio2_complete_operation(p_operation_id, v_result)");
    expect(migration).toContain("'receiptId', p_operation_id");
    expect(migration).toContain("'serverTime', now()");
  });
});
