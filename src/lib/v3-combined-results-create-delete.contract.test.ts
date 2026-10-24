import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261024230500_v3_combined_results_create_delete_commands.sql",
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

describe("System V3 governed Combined aggregation create/delete", () => {
  it("registers the forward migration contract", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("'v3.results.combined-create-delete'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain(
      "'Add governed exact-edition Combined aggregation create and destructive delete commands with S2 replay, CAS and tombstone evidence.'",
    );
  });

  it("creates only inside the exact linked Televoting edition with canonical initial versions", () => {
    const create = body("public.v3_create_combined_result");
    expect(create).toContain("studio2_access_allowed('voting.manage', p_edition_id, false)");
    expect(create.match(/private\.v3_combined_remote_edition\(p_edition_id\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(create).toContain("insert into televoting.televote_aggregations");
    expect(create).toContain("'component_pool'");
    expect(create).toContain("'draft'");
    expect(create).toContain("'combined'");
    expect(create).toContain("config_version");
    expect(create).toContain("state_version");
    expect(create).toContain("'configVersion', 1");
    expect(create).toContain("'stateVersion', 1");
    expect(create).toContain("'calculationVersion', 0");
  });

  it("makes creation lost-response safe through S2 receipt claim before insert", () => {
    const create = body("public.v3_create_combined_result");
    const claim = create.indexOf("private.studio2_claim_operation(");
    const insert = create.indexOf("insert into televoting.televote_aggregations");
    expect(claim).toBeGreaterThanOrEqual(0);
    expect(insert).toBeGreaterThan(claim);
    expect(create).toContain("'voting.configure'");
    expect(create).toContain("'R2'");
    expect(create).toContain("'action', 'create'");
    expect(create).toContain("public.studio2_reconcile_operation(v_operation_id)");
  });

  it("records immutable audit and domain evidence for creation", () => {
    const create = body("public.v3_create_combined_result");
    expect(create).toContain("insert into televoting.admin_audit_log");
    expect(create).toContain("'create_combined_televote'");
    expect(create).toContain("private.v3_emit_domain_event(");
    expect(create).toContain("'voting.configuration_changed'");
    expect(create).toContain("'aggregation_created'");
    expect(create).toContain("private.studio2_complete_operation(v_operation_id, v_result)");
  });

  it("requires reason, exact edition and three-way CAS for destructive deletion", () => {
    const remove = body("public.v3_delete_combined_result");
    expect(remove).toContain("v_reason is null");
    expect(remove).toContain("studio2_access_allowed('voting.manage', p_edition_id, false)");
    expect(remove).toContain("'voting.configure'");
    expect(remove).toContain("'R3'");
    expect(remove).toContain("v_aggregation.config_version is distinct from p_expected_config_version");
    expect(remove).toContain("v_aggregation.state_version is distinct from p_expected_state_version");
    expect(remove).toContain("v_aggregation.calculation_version is distinct from p_expected_calculation_version");
    expect(remove).toContain("errcode = 'PT409', message = 'VERSION_CONFLICT'");
    expect(remove).toContain("public.v3_combined_result_preflight(");
    expect(remove).toContain("'delete'");
  });

  it("locks cascade children before the parent aggregate during legacy coexistence", () => {
    const remove = body("public.v3_delete_combined_result");
    const values = remove.indexOf("from televoting.external_score_entries entry");
    const sources = remove.indexOf("from televoting.televote_aggregation_sources source\n  where source.aggregation_id = p_aggregation_id\n  order by source.id\n  for update;");
    const participants = remove.indexOf("from televoting.televote_aggregation_participants participant\n  where participant.aggregation_id = p_aggregation_id\n  order by participant.country_code\n  for update;");
    const components = remove.indexOf("from televoting.combined_televote_component_results component\n  where component.aggregation_id = p_aggregation_id\n  order by component.id\n  for update;");
    const results = remove.indexOf("from televoting.combined_televote_results result_row\n  where result_row.aggregation_id = p_aggregation_id\n  order by result_row.id\n  for update;");
    const aggregate = remove.indexOf("where aggregation.id = p_aggregation_id\n  for update;");
    expect(values).toBeGreaterThanOrEqual(0);
    expect(sources).toBeGreaterThan(values);
    expect(participants).toBeGreaterThan(sources);
    expect(components).toBeGreaterThan(participants);
    expect(results).toBeGreaterThan(components);
    expect(aggregate).toBeGreaterThan(results);
  });

  it("captures cascade impact before deletion and suppresses child invalidation during cascade", () => {
    const remove = body("public.v3_delete_combined_result");
    expect(remove).toContain("v_source_count");
    expect(remove).toContain("v_participant_count");
    expect(remove).toContain("v_manual_value_count");
    expect(remove).toContain("v_component_result_count");
    expect(remove).toContain("v_final_result_count");
    expect(remove).toContain("set_config('solaris.v3_combined_config_batch', '1', true)");
    expect(remove).toContain("delete from televoting.televote_aggregations aggregation");
    expect(remove).toContain("set_config('solaris.v3_combined_config_batch', '0', true)");
  });

  it("emits a monotonic tombstone version and durable deletion evidence", () => {
    const remove = body("public.v3_delete_combined_result");
    expect(remove).toContain("greatest(");
    expect(remove).toContain("v_aggregation.config_version");
    expect(remove).toContain("v_aggregation.state_version");
    expect(remove).toContain("v_aggregation.calculation_version::bigint");
    expect(remove).toContain("+ 1");
    expect(remove).toContain("'delete_combined_televote'");
    expect(remove).toContain("'aggregation_deleted'");
    expect(remove).toContain("'tombstoneVersion', v_tombstone_version");
    expect(remove).toContain("private.studio2_complete_operation(v_operation_id, v_result)");
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