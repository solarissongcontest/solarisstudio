import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261019210500_v3_show_lineup_command_authority.sql",
  ),
  "utf8",
);

describe("V3 governed show line-up command authority", () => {
  it("registers the post-S13 migration contract and remains additive", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("20261019210500_v3_show_lineup_command_authority");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).not.toMatch(/drop\s+(table|column|function)/i);
  });

  it("derives an opaque state version from canonical show and participant state", () => {
    expect(migration).toContain("private.v3_show_lineup_state_payload");
    expect(migration).toContain("private.v3_show_lineup_state_version");
    expect(migration).toContain("extensions.digest");
    expect(migration).toContain("'lineupStage', s.lineup_stage");
    expect(migration).toContain("'runningOrder', p.running_order");
    expect(migration).toContain("'allocation', p.running_order_allocation");
  });

  it("provides explicit preflight without treating it as commit permission", () => {
    expect(migration).toContain("public.v3_show_lineup_preflight");
    expect(migration).toContain("'blockers', to_jsonb(v_blockers)");
    expect(migration).toContain("'consequences', case v_action");
    expect(migration).toContain("'stateVersion', v_state_version");

    const claimIndex = migration.indexOf("private.studio2_claim_operation(");
    const lockIndex = migration.indexOf("where id = p_show_id\n  for update;");
    const versionIndex = migration.indexOf("message = 'VERSION_CONFLICT'");
    expect(claimIndex).toBeGreaterThan(-1);
    expect(lockIndex).toBeGreaterThan(claimIndex);
    expect(versionIndex).toBeGreaterThan(lockIndex);
  });

  it("binds the command to authenticated exact-edition capability scope", () => {
    expect(migration).toContain("if auth.uid() is null then");
    expect(migration).toContain("message = 'SCOPE_MISMATCH'");
    expect(migration).toContain("public.studio2_access_allowed('entry.edit', p_edition_id, true)");
    expect(migration).toContain("message = 'AUTHORIZATION'");
  });

  it("makes allocation and running-order replacement atomic and complete-set validated", () => {
    expect(migration).toContain("'start_allocation'");
    expect(migration).toContain("'save_allocation'");
    expect(migration).toContain("'start_running_order'");
    expect(migration).toContain("'save_running_order'");
    expect(migration).toContain("v_supplied <> v_participant_count");
    expect(migration).toContain("v_distinct <> v_participant_count");
    expect(migration).toContain("jsonb_array_elements_text(v_order) with ordinality");
    expect(migration).toContain("set running_order = requested.position");
  });

  it("moves confirmed-country line-up sync behind the same governed envelope", () => {
    expect(migration).toContain("'sync_confirmed_countries'");
    expect(migration).toContain("p.show_id is null");
    expect(migration).toContain("p.participation_status = 'confirmed'");
    expect(migration).toContain("membership_locked_after_allocation_started");
    expect(migration).toContain("running_order_allocation");
  });

  it("persists operation, audit and canonical completed-fact evidence", () => {
    expect(migration).toContain("private.studio2_claim_operation(");
    expect(migration).toContain("public.studio2_reconcile_operation(v_operation_id)");
    expect(migration).toContain("insert into public.admin_audit_log");
    expect(migration).toContain("private.v3_emit_domain_event(");
    expect(migration).toContain("'show.changed'");
    expect(migration).toContain("private.studio2_complete_operation(v_operation_id, v_result)");
  });

  it("does not expose the private version helpers to browser roles", () => {
    expect(migration).toContain(
      "revoke all on function private.v3_show_lineup_state_payload(uuid)\n  from public, anon, authenticated;",
    );
    expect(migration).toContain(
      "revoke all on function private.v3_show_lineup_state_version(uuid)\n  from public, anon, authenticated;",
    );
    expect(migration).toContain(
      "revoke all on function public.v3_execute_show_lineup_operation(\n  uuid, uuid, text, jsonb, uuid, text, text, text, uuid\n) from public, anon;",
    );
  });
});
