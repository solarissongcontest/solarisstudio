import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const authority = readFileSync(
  "supabase/migrations/20261019233500_v3_jury_correction_authority.sql",
  "utf8",
);
const compatibility = readFileSync(
  "supabase/migrations/20261019233600_v3_jury_correction_revision_compat.sql",
  "utf8",
);
const client = readFileSync("src/lib/jury-correction-authority.ts", "utf8");
const juryConsequences = readFileSync(
  "supabase/migrations/20261016040000_v3_s5_jury_consequences.sql",
  "utf8",
);
const resultsConsequences = readFileSync(
  "supabase/migrations/20261016053000_v3_s5_results_consequences.sql",
  "utf8",
);

describe("V3 Organizer Jury correction authority", () => {
  it("versions the exact ballot aggregate and makes compatibility writes advance the same CAS state", () => {
    expect(authority).toContain("create table if not exists public.studio2_jury_ballot_revisions");
    expect(authority).toContain("create trigger v3_track_jury_vote_revision");
    expect(authority).toContain("create trigger v3_track_jury_dnv_revision");
    expect(compatibility).toContain("when p_voter_id is not null then 'voter:'");
    expect(compatibility).toContain("when p_voter_country_id is not null then 'country:'");
    expect(compatibility).toContain("when p_voter_entity_id is not null then 'entity:'");
    expect(compatibility).toContain("Exactly one revision bump per affected aggregate");
  });

  it("preflights exact edition/show/voter/recipient scope and canonical ballot constraints", () => {
    expect(authority).toContain("public.studio2_jury_correction_preview(");
    expect(authority).toContain("private.v3_assert_jury_vote_object_scope(");
    expect(authority).toContain("'jury.ballots.manage'");
    expect(authority).toContain("'POINT_NOT_IN_SCALE'");
    expect(authority).toContain("'RECIPIENT_NOT_IN_SHOW'");
    expect(authority).toContain("'SELF_VOTE_NOT_ALLOWED'");
    expect(authority).toContain("'BALLOT_MARKED_DID_NOT_VOTE'");
    expect(authority).toContain("'stateVersion', v_revision");
    expect(authority).toContain("'submission', v_submission");
  });

  it("fails closed once result publication or immutable result gates make a score edit unsafe", () => {
    expect(authority).toContain("'RESULTS_ALREADY_PUBLIC'");
    expect(authority).toContain("'RESULTS_PUBLICATION_SCHEDULED'");
    expect(authority).toContain("'RESULTS_LOCKED'");
    expect(authority).toContain("'RESULTS_REVEAL_READY'");
    expect(authority).toContain("'CALCULATED_RESULTS_REQUIRE_COMPLETE_BALLOT'");
    expect(authority).toContain("'CORRECTION_WOULD_LEAVE_BALLOT_INCOMPLETE'");
  });

  it("uses one R3 idempotent operation with fresh auth and optimistic concurrency", () => {
    expect(authority).toContain("private.studio2_require_fresh_auth(300)");
    expect(authority).toContain("'jury.correction.assign'");
    expect(authority).toContain("'jury.correction.clear'");
    expect(authority).toContain("private.studio2_claim_operation(");
    expect(authority).toContain("'R3'");
    expect(authority).toContain("message = 'STATE_CHANGED'");
    expect(authority).toContain("private.studio2_complete_operation(p_operation_id, v_result)");
  });

  it("reuses proven low-level Jury writers instead of creating competing score truth", () => {
    expect(authority).toContain("v_vote_id := public.assign_jury_vote(");
    expect(authority).toContain("v_cleared := public.clear_jury_point(");
    expect(authority).not.toContain("insert into public.jury_votes (");
    expect(authority).not.toContain("update public.results\n      set jury_points");
  });

  it("recalculates existing result evidence atomically through the canonical Results authority", () => {
    expect(authority).toContain("public.studio2_execute_result_operation(");
    expect(authority).toContain("'calculate'");
    expect(authority).toContain("v_result_execution_id := gen_random_uuid()");
    expect(authority).toContain("'resultRecalculated', v_recalculated");
    expect(resultsConsequences).toContain("'results.calculated'");
    expect(resultsConsequences).toContain("private.v3_emit_domain_event(");
  });

  it("emits the existing event-backed Jury fact instead of inventing correction-only consequence truth", () => {
    expect(authority).toContain("'jury.ballot_changed'");
    expect(authority).toContain("array['jury.tasks']::text[]");
    expect(authority).toContain("create trigger v3_emit_jury_correction_operation_event");
    expect(juryConsequences).toContain("'jury.ballot_changed'");
    expect(juryConsequences).toContain("private.studio2_reconcile_all_organizer_tasks");
  });

  it("lets clients preview, review R3, commit, and reconcile uncertain outcomes", () => {
    expect(client).toContain("previewJuryCorrection");
    expect(client).toContain("reauthenticateJuryCorrectionR3");
    expect(client).toContain("applyJuryCorrection");
    expect(client).toContain("studio2_reconcile_operation");
    expect(client).toContain("jury-correction:${operationId}");
    expect(client).toContain("operationId !== expected.operationId");
    expect(client).toContain("editionId !== expected.editionId");
    expect(client).toContain("showId !== expected.showId");
  });

  it("keeps the privileged correction endpoints unavailable to anonymous callers", () => {
    expect(authority).toContain(
      "revoke all on function public.studio2_jury_correction_preview(\n  uuid, uuid, uuid, uuid, uuid, text, integer, uuid, uuid\n) from public, anon",
    );
    expect(authority).toContain(
      "revoke all on function public.studio2_apply_jury_correction(\n  uuid, uuid, uuid, uuid, uuid, text, integer, uuid, uuid,\n  bigint, text, uuid, text\n) from public, anon",
    );
  });
});
