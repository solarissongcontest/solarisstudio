import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261024224500_v3_combined_results_participant_command.sql",
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

describe("System V3 canonical Combined participant reconciliation", () => {
  it("registers the forward migration contract", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("'v3.results.combined-participant-reconciliation'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain(
      "'Add canonical exact-edition Combined participant reconciliation with bounded batch CAS behavior while preserving the legacy invalidation bridge during cutover.'",
    );
  });

  it("adds a transaction-local batch guard to avoid one CAS bump per replaced row", () => {
    const trigger = body("televoting.flag_aggregation_outdated");
    expect(trigger).toContain("current_setting('solaris.v3_combined_config_batch', true)");
    expect(trigger).toContain("return coalesce(new, old)");

    const command = body("public.v3_reconcile_combined_result_participants");
    expect(command).toContain("set_config('solaris.v3_combined_config_batch', '1', true)");
    expect(command).toContain("set_config('solaris.v3_combined_config_batch', '0', true)");
    expect(command).toContain("perform private.v3_touch_combined_configuration(p_aggregation_id)");
  });

  it("derives participants from exactly one canonical Solaris show instead of caller-supplied identity", () => {
    const command = body("public.v3_reconcile_combined_result_participants");
    expect(command).toContain("public.v3_combined_result_detail(p_edition_id, p_aggregation_id)");
    expect(command).toContain("not in ('up_to_date', 'drift')");
    expect(command).toContain("from public.participants participant");
    expect(command).toContain("left join public.countries country on country.id = participant.country_id");
    expect(command).toContain("participant.show_id = v_show_id");
    expect(command).toContain("participant.participation_status, 'confirmed'");
    expect(command).toContain("Canonical show participants must all resolve to a country code.");
    expect(command).not.toContain("p_participants");
  });

  it("binds exact edition authority and all three expected versions", () => {
    const command = body("public.v3_reconcile_combined_result_participants");
    expect(command).toContain("studio2_access_allowed('voting.manage', p_edition_id, false)");
    expect(command).toContain("private.v3_combined_remote_edition(p_edition_id)");
    expect(command).toContain("for update;");
    expect(command).toContain("v_aggregation.config_version is distinct from p_expected_config_version");
    expect(command).toContain("v_aggregation.state_version is distinct from p_expected_state_version");
    expect(command).toContain("v_aggregation.calculation_version is distinct from p_expected_calculation_version");
    expect(command).toContain("errcode = 'PT409', message = 'VERSION_CONFLICT'");
  });

  it("uses canonical receipt replay and consequence-aware commit preflight", () => {
    const command = body("public.v3_reconcile_combined_result_participants");
    const claim = command.indexOf("private.studio2_claim_operation(");
    const lock = command.indexOf("for update;");
    expect(claim).toBeGreaterThanOrEqual(0);
    expect(lock).toBeGreaterThan(claim);
    expect(command).toContain("'voting.configure'");
    expect(command).toContain("'R2'");
    expect(command).toContain("'mode', 'canonical_show_snapshot'");
    expect(command).toContain("public.studio2_reconcile_operation(v_operation_id)");
    expect(command).toContain("public.v3_combined_result_preflight(");
    expect(command).toContain("'participants'");
  });

  it("performs one bounded snapshot replacement only when drift exists", () => {
    const command = body("public.v3_reconcile_combined_result_participants");
    expect(command).toContain("v_changed := v_actual_codes is distinct from v_expected_codes");
    expect(command).toContain("delete from televoting.televote_aggregation_participants participant");
    expect(command).toContain("insert into televoting.televote_aggregation_participants");
    expect(command).toContain("from unnest(v_expected_codes) with ordinality");
    expect(command).not.toContain("update public.participants");
    expect(command).not.toContain("insert into public.participants");
  });

  it("records audit and a receipt-bound voting configuration event without leaking participant identities", () => {
    const command = body("public.v3_reconcile_combined_result_participants");
    expect(command).toContain("insert into televoting.admin_audit_log");
    expect(command).toContain("'reconcile_combined_participants'");
    expect(command).toContain("'source', 'canonical_solaris_show'");
    expect(command).toContain("private.v3_emit_domain_event(");
    expect(command).toContain("'voting.configuration_changed'");
    expect(command).toContain("'participantCount', v_expected_count");
    expect(command).not.toContain("'participantCodes'");
    expect(command).not.toContain("v_expected_codes,");
    expect(command).toContain("private.studio2_complete_operation(v_operation_id, v_result)");
  });

  it("does not grant anonymous execution or new direct browser table authority", () => {
    expect(migration).toContain(
      "revoke all on function public.v3_reconcile_combined_result_participants(\n  uuid, uuid, bigint, bigint, integer, uuid, text, uuid, text\n) from public, anon;",
    );
    expect(migration).toContain(
      "grant execute on function public.v3_reconcile_combined_result_participants(\n  uuid, uuid, bigint, bigint, integer, uuid, text, uuid, text\n) to authenticated, service_role;",
    );
    expect(migration).not.toMatch(/grant\s+(insert|update|delete|all)[\s\S]*?to\s+authenticated/i);
  });

  it("is transactional and reloads PostgREST metadata", () => {
    expect(migration.trimStart().toLowerCase().startsWith("begin;")).toBe(true);
    expect(migration).toContain("notify pgrst, 'reload schema';");
    expect(migration.trimEnd().toLowerCase().endsWith("commit;")).toBe(true);
  });
});