import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const preflight = readFileSync(
  "supabase/migrations/20261026192000_v3_show_lineup_membership_preflight.sql",
  "utf8",
);
const execute = readFileSync(
  "supabase/migrations/20261026192100_v3_show_lineup_membership_execute.sql",
  "utf8",
);
const migration = `${preflight}\n${execute}`;
const server = readFileSync("src/lib/admin-lineup-membership.functions.ts", "utf8");

describe("V3 governed show line-up membership authority", () => {
  it("registers forward-only S13 contracts without destructive identity DDL", () => {
    expect(preflight).toContain("'v3.show-lineup-membership-preflight'");
    expect(execute).toContain("'v3.show-lineup-membership-execute'");
    expect(preflight).toContain("'forward_fix_only'");
    expect(execute).toContain("'forward_fix_only'");
    expect(migration).not.toMatch(/drop\s+(table|column|function)/i);
  });

  it("keeps contest identity durable while dependency-checking show membership removal", () => {
    expect(preflight).toContain("private.v3_show_member_dependency_summary");
    expect(preflight).toContain("from public.results r");
    expect(preflight).toContain("from public.jury_votes v");
    expect(preflight).toContain("from public.televote_votes v");
    expect(preflight).toContain("from public.voters v");
    expect(preflight).toContain("from public.jury_ballot_submissions s");
    expect(preflight).toContain("from public.jury_ballot_statuses s");
    expect(preflight).toContain("official_show_dependencies_exist");
    expect(preflight).toContain("published_entry_membership");
    expect(execute).toContain("delete from public.participants where id = v_participant.id");
    expect(migration).not.toContain("delete from public.contest_entities");
  });

  it("locks membership before allocation and revalidates dependencies under transaction locks", () => {
    expect(preflight).toContain("membership_locked_after_allocation_started");
    expect(execute).toContain("v_show.lineup_stage is distinct from 'lineup'");
    const claimIndex = execute.indexOf("private.studio2_claim_operation(");
    const showLockIndex = execute.indexOf("where id = p_show_id\n  for update;");
    const versionIndex = execute.indexOf("message = 'VERSION_CONFLICT'");
    const dependencyIndex = execute.indexOf("private.v3_show_member_dependency_summary(");
    const mutationIndex = execute.indexOf("delete from public.participants where id = v_participant.id");
    expect(claimIndex).toBeGreaterThan(-1);
    expect(showLockIndex).toBeGreaterThan(claimIndex);
    expect(versionIndex).toBeGreaterThan(showLockIndex);
    expect(dependencyIndex).toBeGreaterThan(versionIndex);
    expect(mutationIndex).toBeGreaterThan(dependencyIndex);
  });

  it("requires a reason and R3 risk for destructive removal", () => {
    expect(execute).toContain("v_action = 'member_remove' and v_reason is null");
    expect(execute).toContain("message = 'REASON_REQUIRED'");
    expect(execute).toContain("case when v_action = 'member_remove' then 'R3' else 'R2' end");
    expect(execute).toContain("'show.lineup.member.remove'");
  });

  it("validates qualifier provenance and rejects duplicate final membership", () => {
    expect(migration).toContain("source.qualified = true");
    expect(migration).toContain("source.show_id is distinct from p_show_id");
    expect(preflight).toContain("target_show_is_not_final");
    expect(preflight).toContain("qualifier_already_in_final");
    expect(execute).toContain("'sourceParticipantIds', to_jsonb(v_source_ids)");
  });

  it("persists operation, audit, completed-fact event and durable readback", () => {
    expect(execute).toContain("private.studio2_claim_operation(");
    expect(execute).toContain("insert into public.admin_audit_log");
    expect(execute).toContain("private.v3_emit_domain_event(");
    expect(execute).toContain("'show.changed'");
    expect(execute).toContain("private.studio2_complete_operation(v_operation_id, v_result)");
    expect(execute).toContain("public.studio2_reconcile_operation(v_operation_id)");
  });

  it("exposes one authenticated server boundary with unknown-outcome reconciliation", () => {
    expect(server).toContain("export const executeShowLineupMembershipOperation");
    expect(server).toContain('client.rpc("studio2_reconcile_operation"');
    expect(server).toContain('client.rpc("v3_show_lineup_membership_preflight"');
    expect(server).toContain('"v3_execute_show_lineup_membership_operation"');
    const reconcileIndex = server.indexOf("reconcileExistingOperation(client, operationId)");
    const preflightIndex = server.indexOf('client.rpc("v3_show_lineup_membership_preflight"');
    expect(reconcileIndex).toBeGreaterThan(-1);
    expect(preflightIndex).toBeGreaterThan(reconcileIndex);
    expect(server).toContain("data.operationId ?? crypto.randomUUID()");
    expect(server).toContain("data.idempotencyKey ?? `show-lineup-membership:${data.action}:${operationId}`");
  });
});
