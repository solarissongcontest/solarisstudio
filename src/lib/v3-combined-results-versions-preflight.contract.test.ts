import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261018210000_v3_combined_results_versions_preflight.sql",
  ),
  "utf8",
);

function body(name: string, nextMarker = "create or replace function") {
  const marker = `create or replace function ${name}`;
  const start = migration.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = migration.indexOf(nextMarker, start + marker.length);
  return migration.slice(start, next === -1 ? migration.length : next);
}

describe("System V3 Combined Results CAS versions and preflight", () => {
  it("adds independent monotonic configuration and state versions", () => {
    expect(migration).toContain("add column if not exists config_version bigint not null default 0");
    expect(migration).toContain("add column if not exists state_version bigint not null default 0");

    const trigger = body("private.v3_bump_combined_aggregation_versions");
    expect(trigger).toContain("new.config_version = old.config_version");
    expect(trigger).toContain("new.config_version := old.config_version + 1");
    expect(trigger).toContain("new.state_version = old.state_version");
    expect(trigger).toContain("new.state_version := old.state_version + 1");
    expect(trigger).toContain("new.edition_id is distinct from old.edition_id");
    expect(trigger).toContain("new.total_points_to_distribute is distinct from old.total_points_to_distribute");
    expect(trigger).toContain("new.public_columns is distinct from old.public_columns");
    expect(trigger).toContain("new.status is distinct from old.status");
    expect(trigger).toContain("new.calculation_version is distinct from old.calculation_version");
    expect(trigger).toContain("new.results_outdated is distinct from old.results_outdated");
  });

  it("makes legacy child configuration writes advance the canonical config CAS", () => {
    const touch = body("private.v3_touch_combined_configuration");
    expect(touch).toContain("config_version = aggregation.config_version + 1");
    expect(touch).toContain("when aggregation.calculation_version > 0 then true");

    const legacy = body("televoting.flag_aggregation_outdated");
    expect(legacy).toContain("tg_table_name = 'external_score_entries'");
    expect(legacy).toContain("if tg_op <> 'DELETE'");
    expect(legacy).toContain("if tg_op <> 'INSERT'");
    expect(legacy).toContain("perform private.v3_touch_combined_configuration(v_new_agg)");
    expect(legacy).toContain("v_old_agg is distinct from v_new_agg");
    expect(legacy).not.toContain("calculation_version>0");
  });

  it("exposes exact-edition CAS state without newest/current fallbacks", () => {
    const versions = body("public.v3_combined_result_versions");
    expect(versions).toContain("private.v3_require_combined_results_read(p_edition_id)");
    expect(versions).toContain("private.v3_combined_remote_edition(p_edition_id)");
    expect(versions).toContain("v_aggregation.edition_id is distinct from v_remote_edition_id");
    expect(versions).toContain("'configVersion', v_aggregation.config_version");
    expect(versions).toContain("'stateVersion', v_aggregation.state_version");
    expect(versions).toContain("'calculationVersion', v_aggregation.calculation_version");
    expect(versions).toContain("'serverTime', now()");
    expect(versions).not.toMatch(/newest|current edition|order by[\s\S]*limit 1/i);
  });

  it("keeps preflight observational and binds it to exact-edition detail plus versions", () => {
    const preflight = body("public.v3_combined_result_preflight", "revoke all on function public.v3_combined_result_preflight");
    expect(preflight).toContain("stable");
    expect(preflight).toContain("public.v3_combined_result_detail(p_edition_id, p_aggregation_id)");
    expect(preflight).toContain("public.v3_combined_result_versions(p_edition_id, p_aggregation_id)");
    expect(preflight).not.toMatch(/\binsert\s+into\b/i);
    expect(preflight).not.toMatch(/\bupdate\s+[a-z0-9_.\"]+\s+set\b/i);
    expect(preflight).not.toMatch(/\bdelete\s+from\b/i);
    expect(preflight).not.toContain("studio2_claim_operation");
    expect(preflight).not.toContain("v3_emit_domain_event");
  });

  it("classifies risk and confirmation requirements per consequential action", () => {
    const preflight = body("public.v3_combined_result_preflight", "revoke all on function public.v3_combined_result_preflight");
    expect(preflight).toContain("when v_action in ('publish', 'unlock', 'delete') then 'R3'");
    expect(preflight).toContain("when v_action in ('recalculate', 'lock', 'participants', 'source', 'values') then 'R2'");
    expect(preflight).toContain("v_requires_reason := v_action in ('publish', 'unlock', 'delete')");
    expect(preflight).toContain("v_requires_confirmation := v_action in ('publish', 'unlock', 'delete')");
  });

  it("fails preflight closed for immutable, stale, unbound and invalid lifecycle states", () => {
    const preflight = body("public.v3_combined_result_preflight", "revoke all on function public.v3_combined_result_preflight");
    expect(preflight).toContain("'immutable_status'");
    expect(preflight).toContain("'recalculation_required'");
    expect(preflight).toContain("'lock_required'");
    expect(preflight).toContain("'participant_binding_not_current'");
    expect(preflight).toContain("'not_locked_or_published'");
    expect(preflight).toContain("'published_result_cannot_delete'");
  });

  it("returns every version needed for commit-time CAS and consequence evidence", () => {
    const preflight = body("public.v3_combined_result_preflight", "revoke all on function public.v3_combined_result_preflight");
    expect(preflight).toContain("'expectedVersions'");
    expect(preflight).toContain("'configVersion'");
    expect(preflight).toContain("'stateVersion'");
    expect(preflight).toContain("'calculationVersion'");
    expect(preflight).toContain("'participantSnapshot'");
    expect(preflight).toContain("'sourceScopeMismatchCount'");
    expect(preflight).toContain("'storedCalculation'");
    expect(preflight).toContain("'publishedSolarisProjectionPresent'");
    expect(preflight).toContain("'publishedSolarisProjectionCurrent'");
    expect(preflight).toContain("'supersessionOrReconciliationRequired'");
    expect(preflight).toContain("'reconciliationState'");
  });

  it("keeps browser execution behind authenticated exact-edition RPC authority", () => {
    expect(migration).toContain(
      "revoke all on function public.v3_combined_result_versions(uuid, uuid)\n  from public, anon;",
    );
    expect(migration).toContain(
      "grant execute on function public.v3_combined_result_versions(uuid, uuid)\n  to authenticated, service_role;",
    );
    expect(migration).toContain(
      "revoke all on function public.v3_combined_result_preflight(uuid, uuid, text)\n  from public, anon;",
    );
    expect(migration).not.toMatch(/grant execute[\s\S]*?\bto anon\b/i);
  });

  it("is transactional and refreshes PostgREST schema metadata", () => {
    expect(migration.trimStart().toLowerCase().startsWith("begin;")).toBe(true);
    expect(migration).toContain("notify pgrst, 'reload schema';");
    expect(migration.trimEnd().toLowerCase().endsWith("commit;")).toBe(true);
  });
});