import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261024225500_v3_combined_results_value_command.sql",
  ),
  "utf8",
);

function body() {
  const marker = "create or replace function public.v3_save_combined_result_source_values(";
  const start = migration.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf("revoke all on function public.v3_save_combined_result_source_values", start);
  return migration.slice(start, end === -1 ? migration.length : end);
}

describe("System V3 governed Combined manual source values", () => {
  it("registers the forward migration contract", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("'v3.results.combined-manual-values'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain(
      "'Add governed bounded manual Combined source-value replacement with exact-edition authority, S2 replay and three-way CAS.'",
    );
  });

  it("bounds and canonicalizes the semantic payload before operation claim", () => {
    const fn = body();
    const normalize = fn.indexOf("jsonb_object_agg(normalized.code, normalized.value");
    const claim = fn.indexOf("private.studio2_claim_operation(");
    expect(fn).toContain("pg_column_size(p_values) > 65536");
    expect(fn).toContain("v_value_count > 500");
    expect(fn).toContain("length(btrim(item.key)) > 32");
    expect(fn).toContain("abs((item.value #>> '{}')::numeric) > 1000000000000");
    expect(fn).toContain("Manual value country codes collide after normalization");
    expect(fn).toContain("where (item.value #>> '{}')::numeric <> 0");
    expect(normalize).toBeGreaterThanOrEqual(0);
    expect(claim).toBeGreaterThan(normalize);
    expect(fn).toContain("'values', v_normalized");
  });

  it("limits manual writes to unbound sources and current aggregation participant identities", () => {
    const fn = body();
    expect(fn).toContain("v_source.source_round_id is not null");
    expect(fn).toContain("Round-backed Combined source values are derived and cannot be edited manually");
    expect(fn).toContain("from televoting.televote_aggregation_participants participant");
    expect(fn).toContain("upper(btrim(participant.country_code)) = item.key");
    expect(fn).toContain("Manual value references a country outside the Combined participant snapshot");
    expect(fn.match(/jsonb_each\(v_normalized\)/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("uses exact-edition voting.manage, receipt replay and three-way CAS", () => {
    const fn = body();
    expect(fn).toContain("studio2_access_allowed('voting.manage', p_edition_id, false)");
    expect(fn).toContain("private.v3_combined_remote_edition(p_edition_id)");
    expect(fn).toContain("'voting.configure'");
    expect(fn).toContain("'R2'");
    expect(fn).toContain("public.studio2_reconcile_operation(v_operation_id)");
    expect(fn).toContain("v_aggregation.config_version is distinct from p_expected_config_version");
    expect(fn).toContain("v_aggregation.state_version is distinct from p_expected_state_version");
    expect(fn).toContain("v_aggregation.calculation_version is distinct from p_expected_calculation_version");
    expect(fn).toContain("errcode = 'PT409', message = 'VERSION_CONFLICT'");
  });

  it("matches coexistence lock order: value rows then source then aggregate", () => {
    const fn = body();
    const valuesLock = fn.indexOf("from televoting.external_score_entries entry\n  where entry.source_id = p_source_id\n  order by entry.id\n  for update;");
    const sourceLock = fn.indexOf("where source.id = p_source_id\n  for update;");
    const aggregateLock = fn.indexOf("where aggregation.id = p_aggregation_id\n  for update;");
    expect(valuesLock).toBeGreaterThanOrEqual(0);
    expect(sourceLock).toBeGreaterThan(valuesLock);
    expect(aggregateLock).toBeGreaterThan(sourceLock);
  });

  it("reruns value preflight and participant membership validation at commit time", () => {
    const fn = body();
    expect(fn).toContain("public.v3_combined_result_preflight(");
    expect(fn).toContain("'values'");
    expect(fn).toContain("Participant identity can change through legacy paths while an edit form is");
    expect(fn).toContain("errcode = 'PT409', message = 'STATE_CHANGED'");
  });

  it("treats explicit zero and absent storage as the same effective configuration", () => {
    const fn = body();
    expect(fn).toContain("The physical table intentionally omits zero rows");
    expect(fn).toContain("where (item.value #>> '{}')::numeric <> 0");
    expect(fn).toContain("v_changed := v_current is distinct from v_normalized");
    const physicalInsert = fn.slice(fn.indexOf("insert into televoting.external_score_entries"));
    expect(physicalInsert).not.toContain("where (item.value #>> '{}')::numeric <> 0");
  });

  it("logs only real per-country deltas and computes an exact changed count", () => {
    const fn = body();
    expect(fn).toContain("full join jsonb_each(v_normalized) new_item(key, value)");
    expect(fn).toContain("old_item.value #>> '{}'");
    expect(fn).toContain("is distinct from (new_item.value #>> '{}')::numeric");
    expect(fn).toContain("insert into televoting.external_score_entry_log");
    expect(fn).toContain("where old_values.value is distinct from new_values.value");
    expect(fn).toContain("coalesce(new_values.value, 0) - coalesce(old_values.value, 0)");
  });

  it("replaces all values atomically and advances config CAS once", () => {
    const fn = body();
    expect(fn).toContain("set_config('solaris.v3_combined_config_batch', '1', true)");
    expect(fn).toContain("delete from televoting.external_score_entries entry");
    expect(fn).toContain("insert into televoting.external_score_entries");
    expect(fn).toContain("set_config('solaris.v3_combined_config_batch', '0', true)");
    expect(fn).toContain("perform private.v3_touch_combined_configuration(p_aggregation_id)");
  });

  it("records compact audit/event evidence instead of embedding the score map", () => {
    const fn = body();
    expect(fn).toContain("insert into televoting.admin_audit_log");
    expect(fn).toContain("'save_combined_source_values'");
    expect(fn).toContain("'submittedValueCount'");
    expect(fn).toContain("'storedValueCount'");
    expect(fn).toContain("'changedValueCount'");
    expect(fn).toContain("private.v3_emit_domain_event(");
    expect(fn).toContain("'voting.configuration_changed'");
    const event = fn.slice(fn.indexOf("private.v3_emit_domain_event("));
    expect(event).not.toContain("'values', v_normalized");
    expect(fn).toContain("private.studio2_complete_operation(v_operation_id, v_result)");
  });

  it("does not grant anonymous execution or direct browser table writes", () => {
    expect(migration).toContain(
      "revoke all on function public.v3_save_combined_result_source_values(\n  uuid, uuid, uuid, jsonb, bigint, bigint, integer, uuid, text, uuid, text\n) from public, anon;",
    );
    expect(migration).toContain(
      "grant execute on function public.v3_save_combined_result_source_values(\n  uuid, uuid, uuid, jsonb, bigint, bigint, integer, uuid, text, uuid, text\n) to authenticated, service_role;",
    );
    expect(migration).not.toMatch(/grant\s+(insert|update|delete|all)[\s\S]*?to\s+authenticated/i);
  });

  it("is transactional and reloads PostgREST metadata", () => {
    expect(migration.trimStart().toLowerCase().startsWith("begin;")).toBe(true);
    expect(migration).toContain("notify pgrst, 'reload schema';");
    expect(migration.trimEnd().toLowerCase().endsWith("commit;")).toBe(true);
  });
});