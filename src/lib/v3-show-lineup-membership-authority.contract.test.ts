import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261024223100_v3_show_lineup_membership_authority.sql",
  "utf8",
);
const lineupServer = readFileSync("src/lib/admin-lineup.functions.ts", "utf8");
const lineupWorkspace = readFileSync("src/components/admin/ShowLineupWorkspace.tsx", "utf8");

describe("V3 governed show line-up membership authority", () => {
  it("registers a strict post-S13 forward-fix migration contract", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("v3.show-lineup-membership-authority");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).not.toMatch(/drop\s+(table|column|function)/i);
  });

  it("keeps contest identity durable while dependency-checking show membership removal", () => {
    expect(migration).toContain("private.v3_show_member_dependency_summary");
    expect(migration).toContain("from public.results r");
    expect(migration).toContain("from public.jury_votes v");
    expect(migration).toContain("from public.televote_votes v");
    expect(migration).toContain("from public.voters v");
    expect(migration).toContain("from public.jury_ballot_submissions s");
    expect(migration).toContain("from public.jury_ballot_statuses s");
    expect(migration).toContain("official_show_dependencies_exist");
    expect(migration).toContain("published_entry_membership");
    expect(migration).toContain("delete from public.participants where id = v_participant.id");
    expect(migration).not.toContain("delete from public.contest_entities");
  });

  it("locks membership before allocation and revalidates after the show lock", () => {
    expect(migration).toContain("membership_locked_after_allocation_started");
    expect(migration).toContain("v_show.lineup_stage is distinct from 'lineup'");
    const claimIndex = migration.indexOf("private.studio2_claim_operation(");
    const showLockIndex = migration.indexOf("where id = p_show_id\n  for update;");
    const versionIndex = migration.indexOf("message = 'VERSION_CONFLICT'");
    const mutationIndex = migration.indexOf("insert into public.participants (");
    expect(claimIndex).toBeGreaterThan(-1);
    expect(showLockIndex).toBeGreaterThan(claimIndex);
    expect(versionIndex).toBeGreaterThan(showLockIndex);
    expect(mutationIndex).toBeGreaterThan(versionIndex);
  });

  it("requires a reason for destructive member removal and uses a higher risk class", () => {
    expect(migration).toContain("v_action = 'member_remove' and v_reason is null");
    expect(migration).toContain("message = 'REASON_REQUIRED'");
    expect(migration).toContain("case when v_action = 'member_remove' then 'R3' else 'R2' end");
    expect(migration).toContain("'show.lineup.member.remove'");
  });

  it("validates qualifier provenance and rejects duplicate final membership", () => {
    expect(migration).toContain("source.qualified = true");
    expect(migration).toContain("source.show_id is distinct from p_show_id");
    expect(migration).toContain("target_show_is_not_final");
    expect(migration).toContain("qualifier_already_in_final");
    expect(migration).toContain("'sourceParticipantIds', to_jsonb(v_source_ids)");
  });

  it("persists S2 receipt, audit and completed-fact event evidence", () => {
    expect(migration).toContain("private.studio2_claim_operation(");
    expect(migration).toContain("insert into public.admin_audit_log");
    expect(migration).toContain("private.v3_emit_domain_event(");
    expect(migration).toContain("'show.changed'");
    expect(migration).toContain("private.studio2_complete_operation(v_operation_id, v_result)");
    expect(migration).toContain("public.studio2_reconcile_operation(v_operation_id)");
  });

  it("exposes one authenticated replay-safe server boundary", () => {
    expect(lineupServer).toContain("export const executeShowLineupMembershipOperation");
    expect(lineupServer).toContain("runShowLineupMembershipOperation");
    expect(lineupServer).toContain('rpc("v3_show_lineup_membership_preflight"');
    expect(lineupServer).toContain('rpc("v3_execute_show_lineup_membership_operation"');
    const reconcileIndex = lineupServer.indexOf("reconcileExistingOperation(client, operationId)", lineupServer.indexOf("runShowLineupMembershipOperation"));
    const preflightIndex = lineupServer.indexOf('rpc("v3_show_lineup_membership_preflight"');
    expect(reconcileIndex).toBeGreaterThan(-1);
    expect(preflightIndex).toBeGreaterThan(reconcileIndex);
  });

  it("cuts participant membership add/remove and qualifier promotion off direct browser writes", () => {
    expect(lineupWorkspace).toContain("useServerFn(executeShowLineupMembershipOperation)");
    expect(lineupWorkspace).toContain('runGovernedMembership(\n      "member_add"');
    expect(lineupWorkspace).toContain('runGovernedMembership(\n        "member_remove"');
    expect(lineupWorkspace).toContain('runGovernedMembership(\n        "promote_qualifiers"');
    expect(lineupWorkspace).not.toContain('supabase.from("participants").delete()');
    expect(lineupWorkspace).not.toContain("const rows = qualifierCandidates.map");
    expect(lineupWorkspace).not.toContain("const prior = (allParticipants as LifecycleParticipant[])");
  });

  it("keeps membership-changing controls closed after allocation begins", () => {
    expect(lineupWorkspace).toContain('disabled={!activeShow || stage !== "lineup"}');
    expect(lineupWorkspace).toContain('disabled={busy || stage !== "lineup" || !qualifierCandidates.length}');
    expect(lineupWorkspace).toContain('disabled={busy || stage !== "lineup"} onClick={() => setRemoveTarget(participant)}');
  });
});
