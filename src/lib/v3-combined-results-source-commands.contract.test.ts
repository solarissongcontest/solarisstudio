import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261024225000_v3_combined_results_source_commands.sql",
  ),
  "utf8",
);

function body(name: string, next = "revoke all on function") {
  const marker = `create or replace function ${name}`;
  const start = migration.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf(next, start + marker.length);
  return migration.slice(start, end === -1 ? migration.length : end);
}

describe("System V3 governed Combined source commands", () => {
  it("registers the forward migration contract", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("'v3.results.combined-source-commands'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain(
      "'Add governed exact-edition Combined source create, update and delete commands with S2 replay, CAS and source-binding validation.'",
    );
  });

  it("validates round-backed sources against the exact Solaris and Televoting editions", () => {
    const validate = body("private.v3_validate_combined_source_round");
    expect(validate).toContain("from televoting.rounds round_row");
    expect(validate).toContain("v_round_edition is distinct from p_remote_edition_id");
    expect(validate).toContain("from public.televoting_round_bindings binding");
    expect(validate).toContain("v_binding.edition_id is distinct from p_edition_id");
    expect(validate).toContain("v_binding.show_id is null");
    expect(validate).toContain("show_row.edition_id = p_edition_id");
    expect(validate).toContain("'scopeState', 'exact_edition'");
    expect(validate).toContain("'scopeState', 'manual'");
  });

  it("keeps source input vocabulary bounded and correction semantics explicit", () => {
    const upsert = body("public.v3_upsert_combined_result_source");
    expect(upsert).toContain("'raw_results', 'converted_points', 'activity_points', 'correction'");
    expect(upsert).toContain("v_source_type !~ '^[a-z][a-z0-9_-]{0,63}$'");
    expect(upsert).toContain("p_weight < 0");
    expect(upsert).toContain("p_weight > 100");
    expect(upsert).toContain("p_display_order not between 0 and 1000");
    expect(upsert).toContain("Correction sources cannot bind a voting round");
    expect(upsert).toContain("Only correction sources may target another source");
    expect(upsert).toContain("Source-scoped correction requires a target source");
    expect(upsert).toContain("Correction source cannot target itself");
  });

  it("binds create/update to exact-edition voting.manage and three-way CAS", () => {
    const upsert = body("public.v3_upsert_combined_result_source");
    expect(upsert).toContain("studio2_access_allowed('voting.manage', p_edition_id, false)");
    expect(upsert).toContain("private.v3_combined_remote_edition(p_edition_id)");
    expect(upsert).toContain("v_aggregation.edition_id is distinct from v_remote_edition_id");
    expect(upsert).toContain("v_aggregation.config_version is distinct from p_expected_config_version");
    expect(upsert).toContain("v_aggregation.state_version is distinct from p_expected_state_version");
    expect(upsert).toContain("v_aggregation.calculation_version is distinct from p_expected_calculation_version");
    expect(upsert).toContain("errcode = 'PT409', message = 'VERSION_CONFLICT'");
  });

  it("uses child-first lock order during legacy coexistence", () => {
    const upsert = body("public.v3_upsert_combined_result_source");
    const childLock = upsert.indexOf("where source.id = p_source_id\n    for update;");
    const aggregateLock = upsert.indexOf("where aggregation.id = p_aggregation_id\n  for update;");
    expect(childLock).toBeGreaterThanOrEqual(0);
    expect(aggregateLock).toBeGreaterThan(childLock);

    const remove = body("public.v3_delete_combined_result_source");
    const removeChild = remove.indexOf("where source.id = p_source_id\n  for update;");
    const removeAggregate = remove.indexOf("where aggregation.id = p_aggregation_id\n  for update;");
    expect(removeChild).toBeGreaterThanOrEqual(0);
    expect(removeAggregate).toBeGreaterThan(removeChild);
  });

  it("claims receipt before CAS, reruns preflight and revalidates round binding at commit", () => {
    const upsert = body("public.v3_upsert_combined_result_source");
    const claim = upsert.indexOf("private.studio2_claim_operation(");
    const version = upsert.indexOf("v_aggregation.config_version is distinct from p_expected_config_version");
    expect(claim).toBeGreaterThanOrEqual(0);
    expect(version).toBeGreaterThan(claim);
    expect(upsert).toContain("'voting.configure'");
    expect(upsert).toContain("'R2'");
    expect(upsert).toContain("public.v3_combined_result_preflight(");
    expect(upsert).toContain("'source'");
    expect(upsert.match(/private\.v3_validate_combined_source_round\(/g)?.length).toBeGreaterThanOrEqual(2);
    expect(upsert).toContain("public.studio2_reconcile_operation(v_operation_id)");
  });

  it("advances configuration once per logical source upsert rather than once per physical row trigger", () => {
    const upsert = body("public.v3_upsert_combined_result_source");
    expect(upsert).toContain("set_config('solaris.v3_combined_config_batch', '1', true)");
    expect(upsert).toContain("set_config('solaris.v3_combined_config_batch', '0', true)");
    expect(upsert).toContain("perform private.v3_touch_combined_configuration(p_aggregation_id)");
    expect(upsert).toContain("insert into televoting.televote_aggregation_sources");
    expect(upsert).toContain("update televoting.televote_aggregation_sources source");
  });

  it("makes source deletion explicit, reasoned and dependency-aware", () => {
    const remove = body("public.v3_delete_combined_result_source");
    expect(remove).toContain("v_reason is null");
    expect(remove).toContain("dependent.correction_target_source_id = p_source_id");
    expect(remove).toContain("Remove or retarget dependent correction sources before deleting this source.");
    expect(remove).toContain("from televoting.external_score_entries entry");
    expect(remove).toContain("delete from televoting.external_score_entries entry");
    expect(remove).toContain("delete from televoting.televote_aggregation_sources source");
    expect(remove).toContain("'deletedManualValueCount', v_value_count");
  });

  it("records audit and immutable voting configuration events for semantic changes", () => {
    const upsert = body("public.v3_upsert_combined_result_source");
    expect(upsert).toContain("insert into televoting.admin_audit_log");
    expect(upsert).toContain("'create_combined_source'");
    expect(upsert).toContain("'update_combined_source'");
    expect(upsert).toContain("private.v3_emit_domain_event(");
    expect(upsert).toContain("'voting.configuration_changed'");
    expect(upsert).toContain("'source_created'");
    expect(upsert).toContain("'source_updated'");
    expect(upsert).toContain("private.studio2_complete_operation(v_operation_id, v_result)");

    const remove = body("public.v3_delete_combined_result_source");
    expect(remove).toContain("'delete_combined_source'");
    expect(remove).toContain("'source_deleted'");
    expect(remove).toContain("private.v3_emit_domain_event(");
  });

  it("does not grant anonymous or direct browser table mutation authority", () => {
    expect(migration).toContain("from public, anon;");
    expect(migration).toContain("to authenticated, service_role;");
    expect(migration).not.toMatch(/grant\s+(insert|update|delete|all)[\s\S]*?to\s+authenticated/i);
  });

  it("is transactional and reloads PostgREST metadata", () => {
    expect(migration.trimStart().toLowerCase().startsWith("begin;")).toBe(true);
    expect(migration).toContain("notify pgrst, 'reload schema';");
    expect(migration.trimEnd().toLowerCase().endsWith("commit;")).toBe(true);
  });
});