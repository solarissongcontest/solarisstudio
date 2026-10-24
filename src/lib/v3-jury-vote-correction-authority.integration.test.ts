import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const authority = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20261019223000_v3_jury_vote_correction_authority.sql"),
  "utf8",
);
const preflight = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20261019223100_v3_jury_correction_preflight_blockers.sql"),
  "utf8",
);
const publicationGuard = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/20261019223200_v3_jury_correction_publication_guard.sql"),
  "utf8",
);

describe("V3 Organizer Jury vote correction authority", () => {
  it("registers every forward-only migration under the S13 framework", () => {
    expect(authority).toContain("public.v3_register_migration_contract(");
    expect(authority).toContain("'20261019223000_v3_jury_vote_correction_authority'");
    expect(authority).toContain("'forward_fix_only'");
    expect(preflight).toContain("public.v3_register_migration_contract(");
    expect(preflight).toContain("'20261019223100_v3_jury_correction_preflight_blockers'");
    expect(preflight).toContain("'forward_fix_only'");
    expect(publicationGuard).toContain("public.v3_register_migration_contract(");
    expect(publicationGuard).toContain("'20261019223200_v3_jury_correction_publication_guard'");
    expect(publicationGuard).toContain("'forward_fix_only'");
  });

  it("keeps the existing object-scope authority and requires Organizer Jury capability", () => {
    expect(authority).toContain("private.v3_assert_jury_vote_object_scope(");
    expect(authority).toContain("studio2_access_allowed('jury.ballots.manage'");
    expect(authority).toContain("public.assign_jury_vote(");
    expect(authority).toContain("public.clear_jury_point(");
  });

  it("returns exact preflight identity, current assignment, blockers and Result consequence", () => {
    expect(preflight).toContain("'currentPointAssignment'");
    expect(preflight).toContain("'blockers', v_blockers");
    expect(preflight).toContain("'canApply', jsonb_array_length(v_blockers) = 0");
    expect(preflight).toContain("'BALLOT_NOT_ACTIVE'");
    expect(preflight).toContain("'JURY_DID_NOT_VOTE'");
    expect(preflight).toContain("'RESULTS_PROTECTED'");
    expect(preflight).toContain("'recalculationRequiredIfApplied'");
    expect(preflight).toContain("'stateVersion'");
  });

  it("rejects invalid show targets, invalid score values and self-votes server-side", () => {
    expect(authority).toContain("studio2_jury_correction_target_valid");
    expect(authority).toContain("studio2_jury_correction_points_valid");
    expect(authority).toContain("A Jury cannot assign points to its own entry.");
    expect(authority).toContain("confirmed participant in this show");
  });

  it("uses version plus state fingerprint CAS to detect both governed and legacy concurrent writes", () => {
    expect(authority).toContain("private.studio2_jury_correction_versions");
    expect(authority).toContain("p_expected_version");
    expect(authority).toContain("p_expected_state_hash");
    expect(authority).toContain("VERSION_CONFLICT");
    expect(authority).toContain("studio2_jury_correction_state_hash");
  });

  it("claims one R2 idempotent operation and reconciles replay instead of writing twice", () => {
    const claim = authority.indexOf("private.studio2_claim_operation(");
    const assign = authority.indexOf("v_vote_id := public.assign_jury_vote(");
    expect(claim).toBeGreaterThan(-1);
    expect(assign).toBeGreaterThan(claim);
    expect(authority).toContain("'jury.vote.correct'");
    expect(authority).toContain("'jury.vote.clear'");
    expect(authority).toContain("'R2'");
    expect(authority).toContain("public.studio2_reconcile_operation");
    expect(authority).toContain("private.studio2_complete_operation");
  });

  it("serializes against Results and fails closed after any official outcome publication begins", () => {
    expect(authority).toContain("'studio2-results:' || p_show_id::text");
    expect(authority).toContain("studio2_jury_correction_results_protected");
    expect(authority).toContain("operation.locked_version is not null");
    expect(authority).toContain("operation.reveal_ready_version is not null");
    expect(authority).toContain("control.state in ('scheduled', 'public')");
    expect(authority).toContain("Results must be corrected through the Results correction lifecycle");
    expect(publicationGuard).toContain("private.studio2_publication_has_outcomes(control.frozen_config)");
    expect(publicationGuard).toContain("show_row.publication_config ? 'qualifiers'");
    expect(publicationGuard).toContain("show_row.publication_config -> 'qualifiers' = 'true'::jsonb");
    expect(publicationGuard).toContain("show_row.publication_config -> 'jury_results' = 'true'::jsonb");
  });

  it("forces an unlocked calculated result back to genuine recalculation without destroying immutable snapshots", () => {
    expect(authority).toContain("delete from public.results result");
    expect(authority).toContain("reviewed_version = null");
    expect(authority).toContain("reveal_ready_version = null");
    expect(authority).toContain("'invalidatedResultRows'");
    expect(authority).toContain("'resultsRecalculationRequired'");
    expect(authority).not.toContain("delete from private.v3_result_versions");
  });

  it("writes canonical Jury consequences plus before/after audit and a durable receipt", () => {
    expect(authority).toContain("private.v3_emit_domain_event(");
    expect(authority).toContain("'jury.ballot_changed'");
    expect(authority).toContain("array['jury.tasks']::text[]");
    expect(authority).toContain("insert into public.admin_audit_log");
    expect(authority).toContain("'votes', v_before_votes");
    expect(authority).toContain("'votes', v_after_votes");
    expect(authority).toContain("'receiptId', p_operation_id");
    expect(authority).toContain("'serverTime', now()");
  });

  it("keeps public execution least-privileged", () => {
    expect(authority).toContain("revoke all on function public.studio2_apply_jury_vote_correction");
    expect(authority).toContain("to authenticated;");
    expect(authority).not.toContain("grant execute on function public.studio2_apply_jury_vote_correction(\n  uuid,uuid,uuid,uuid,uuid,text,uuid,uuid,integer,text,bigint,text,uuid,text,uuid\n) to anon");
  });
});
