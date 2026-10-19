import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261020000500_v3_o6_show_lineup_command_authority.sql",
  ),
  "utf8",
);

const client = readFileSync(
  resolve(process.cwd(), "src/lib/v3-show-lineup-operations.ts"),
  "utf8",
);

describe("V3 O6 governed show line-up authority", () => {
  it("registers the additive migration through the S13 migration contract", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("'v3.o6.show-lineup-command-authority'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain("false,");
  });

  it("exposes one permission-aware preflight with deterministic stateVersion", () => {
    expect(migration).toContain("public.studio2_show_lineup_preflight");
    expect(migration).toContain("private.v3_show_lineup_snapshot");
    expect(migration).toContain("extensions.digest");
    expect(migration).toContain("'stateVersion'");
    expect(migration).toContain("studio2_access_allowed('entry.edit', v_edition_id, true)");
  });

  it("locks show and membership before stale-state validation", () => {
    const lockIndex = migration.indexOf("perform private.v3_lock_show_lineup(p_show_id)");
    const casIndex = migration.indexOf(
      "v_before := private.v3_assert_show_lineup_version(",
      lockIndex,
    );
    expect(lockIndex).toBeGreaterThan(-1);
    expect(casIndex).toBeGreaterThan(-1);
    expect(lockIndex).toBeLessThan(casIndex);
    expect(migration).toContain("from public.shows s\n  where s.id = p_show_id\n  for update");
    expect(migration).toContain("from public.participants p\n  where p.show_id = p_show_id\n  order by p.id\n  for update");
    expect(migration).toContain("message = 'VERSION_CONFLICT'");
  });

  it("uses semantic idempotency and durable receipt reconciliation for all three writes", () => {
    for (const command of [
      "show.lineup.stage.transition",
      "show.allocation.save",
      "show.running_order.save",
    ]) {
      expect(migration).toContain(`'${command}'`);
    }
    expect(migration.match(/private\.studio2_claim_operation\(/g)?.length).toBe(3);
    expect(migration.match(/private\.studio2_complete_operation\(/g)?.length).toBe(3);
    expect(migration.match(/public\.studio2_reconcile_operation\(v_operation_id\)/g)?.length).toBe(6);
    expect(migration).toContain("'expectedStateVersion', p_expected_state_version");
  });

  it("keeps existing atomic allocation/order validators behind the new authority", () => {
    expect(migration).toContain("perform public.admin_set_show_allocations(p_show_id, p_allocations)");
    expect(migration).toContain("perform public.admin_set_show_running_order(p_show_id, p_participant_ids)");
    expect(migration).toContain("perform public.admin_set_show_running_order(\n      p_show_id,\n      p_initial_running_order");
  });

  it("makes stage transitions atomic instead of browser-owned multi-write sequences", () => {
    expect(migration).toContain("set running_order = null,\n        running_order_allocation = null");
    expect(migration).toContain("set lineup_stage = 'allocation'");
    expect(migration).toContain("set lineup_stage = 'running_order'");
    expect(migration).toContain("p.running_order_allocation is null");
    expect(migration).toContain("if v_current_stage <> 'lineup'");
    expect(migration).toContain("if v_current_stage <> 'allocation'");
  });

  it("emits immutable canonical facts in the same database transaction", () => {
    expect(migration).toContain("private.v3_emit_domain_event(");
    expect(migration).toContain("'show.lineup_stage_changed'");
    expect(migration).toContain("'show.allocation_saved'");
    expect(migration).toContain("'show.running_order_saved'");
    expect(migration).toContain("'beforeStateVersion'");
    expect(migration).toContain("'afterStateVersion'");
  });

  it("keeps command RPCs authenticated while private helpers stay unexposed", () => {
    for (const rpc of [
      "studio2_transition_show_lineup_stage",
      "studio2_save_show_allocations",
      "studio2_save_show_running_order",
    ]) {
      expect(migration).toContain(`grant execute on function public.${rpc}`);
    }
    expect(migration).toContain("revoke all on function private.v3_show_lineup_snapshot(uuid)");
    expect(migration).toContain("revoke all on function private.v3_lock_show_lineup(uuid)");
    expect(migration).toContain("revoke all on function private.v3_assert_show_lineup_version(uuid, text)");
  });

  it("provides a typed Organizer client that preserves operation identity for replay", () => {
    expect(client).toContain("createOrganisationCommand");
    expect(client).toContain("expectedVersion: input.expectedStateVersion");
    expect(client).toContain("operationId: input.identity?.operationId");
    expect(client).toContain("idempotencyKey: input.identity?.idempotencyKey");
    expect(client).toContain("correlationId: input.identity?.correlationId");
    expect(client).toContain('rpc("studio2_show_lineup_preflight"');
    expect(client).toContain('rpc("studio2_transition_show_lineup_stage"');
    expect(client).toContain('rpc("studio2_save_show_allocations"');
    expect(client).toContain('rpc("studio2_save_show_running_order"');
  });
});
