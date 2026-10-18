import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261018213000_v3_combined_results_config_command.sql",
  ),
  "utf8",
);
const registry = readFileSync(
  resolve(process.cwd(), "src/lib/v3-system-domain-registry.ts"),
  "utf8",
);

function body() {
  const marker = "create or replace function public.v3_configure_combined_result(";
  const start = migration.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf("revoke all on function public.v3_configure_combined_result", start);
  return migration.slice(start, end === -1 ? migration.length : end);
}

describe("System V3 governed Combined Results configuration command", () => {
  it("uses the canonical declared voting configuration command and event vocabulary", () => {
    expect(registry).toContain('mutationCommands: ["voting.configure"]');
    expect(registry).toContain('eventTypes: ["voting.configuration_changed"]');
    const fn = body();
    expect(fn).toContain("'voting.configure'");
    expect(fn).toContain("'voting.configuration_changed'");
    expect(fn).toContain("'combined_result'");
  });

  it("binds the mutation to the exact reviewed Solaris edition", () => {
    const fn = body();
    expect(fn).toContain("studio2_access_allowed('voting.manage', p_edition_id, false)");
    expect(fn).toContain("private.v3_combined_remote_edition(p_edition_id)");
    expect(fn).toContain("v_aggregation.edition_id is distinct from v_remote_edition_id");
    expect(fn).toContain("Combined result is outside the reviewed Organizer edition");
    expect(fn).not.toMatch(/newest|current edition|order by[\s\S]*limit 1/i);
  });

  it("claims the canonical S2 receipt before mutable CAS checks for lost-response replay", () => {
    const fn = body();
    const claim = fn.indexOf("private.studio2_claim_operation(");
    const lock = fn.indexOf("for update;");
    const versionCheck = fn.indexOf("v_aggregation.config_version is distinct from p_expected_config_version");
    expect(claim).toBeGreaterThanOrEqual(0);
    expect(lock).toBeGreaterThan(claim);
    expect(versionCheck).toBeGreaterThan(lock);
    expect(fn).toContain("p_idempotency_key");
    expect(fn).toContain("coalesce(p_correlation_id, p_operation_id)");
    expect(fn).toContain("'expectedConfigVersion', p_expected_config_version");
    expect(fn).toContain("'expectedStateVersion', p_expected_state_version");
    expect(fn).toContain("'expectedCalculationVersion', p_expected_calculation_version");
    expect(fn).toContain("public.studio2_reconcile_operation(v_operation_id)");
  });

  it("re-resolves scope and performs three-way CAS inside the locked transaction", () => {
    const fn = body();
    expect(fn).toContain("where aggregation.id = p_aggregation_id\n  for update;");
    expect(fn).toContain("v_remote_edition_id := private.v3_combined_remote_edition(p_edition_id)");
    expect(fn).toContain("v_aggregation.config_version is distinct from p_expected_config_version");
    expect(fn).toContain("v_aggregation.state_version is distinct from p_expected_state_version");
    expect(fn).toContain("v_aggregation.calculation_version is distinct from p_expected_calculation_version");
    expect(fn).toContain("errcode = 'PT409', message = 'VERSION_CONFLICT'");
    expect(fn).toContain("errcode = 'PT409', message = 'STATE_CHANGED'");
  });

  it("re-runs consequence-aware preflight at commit time and refuses immutable states", () => {
    const fn = body();
    expect(fn).toContain("public.v3_combined_result_preflight(");
    expect(fn).toContain("'configure'");
    expect(fn).toContain("(v_preflight ->> 'canCommit')::boolean");
    expect(fn).toContain("detail = coalesce((v_preflight -> 'blockers')::text, '[]')");
  });

  it("mutates only the legacy top-level configuration surface and invalidates existing calculations", () => {
    const fn = body();
    expect(fn).toContain("update televoting.televote_aggregations aggregation");
    expect(fn).toContain("name = v_name");
    expect(fn).toContain("total_points_to_distribute = p_total_points");
    expect(fn).toContain("rank_exponent = p_rank_exponent");
    expect(fn).toContain("when aggregation.calculation_version > 0 then true");
    expect(fn).not.toContain("televote_aggregation_sources");
    expect(fn).not.toContain("televote_aggregation_participants");
    expect(fn).not.toContain("external_score_entries");
  });

  it("records append-only audit evidence and emits a receipt-bound DomainEvent only for semantic change", () => {
    const fn = body();
    expect(fn).toContain("insert into televoting.admin_audit_log");
    expect(fn).toContain("'configure_combined_result'");
    expect(fn).toContain("old_values");
    expect(fn).toContain("new_values");
    expect(fn).toContain("v_reason");
    expect(fn).toContain("if v_changed then\n    perform private.v3_emit_domain_event(");
    expect(fn).toContain("v_operation_id");
    expect(fn).toContain("v_next_config");
    expect(fn).toContain("array[]::text[]");
    expect(fn).toContain("private.studio2_complete_operation(v_operation_id, v_result)");
  });

  it("does not grant anonymous execution or direct table authority", () => {
    expect(migration).toContain(
      "revoke all on function public.v3_configure_combined_result(\n  uuid, uuid, text, integer, numeric, bigint, bigint, integer, uuid, text, uuid, text\n) from public, anon;",
    );
    expect(migration).toContain(
      "grant execute on function public.v3_configure_combined_result(\n  uuid, uuid, text, integer, numeric, bigint, bigint, integer, uuid, text, uuid, text\n) to authenticated, service_role;",
    );
    expect(migration).not.toMatch(/grant\s+(insert|update|delete|all)[\s\S]*?to\s+authenticated/i);
  });

  it("is transactional and reloads PostgREST metadata", () => {
    expect(migration.trimStart().toLowerCase().startsWith("begin;")).toBe(true);
    expect(migration).toContain("notify pgrst, 'reload schema';");
    expect(migration.trimEnd().toLowerCase().endsWith("commit;")).toBe(true);
  });
});