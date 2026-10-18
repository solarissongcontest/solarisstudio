import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261018234600_v3_combined_results_calculation_command.sql",
  ),
  "utf8",
);
const server = readFileSync(
  resolve(
    process.cwd(),
    "src/integrations/televoting/combined-v3-calculation.server.ts",
  ),
  "utf8",
);

function body(name: string) {
  const marker = `create or replace function ${name}(`;
  const start = migration.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = migration.indexOf("create or replace function", start + marker.length);
  return migration.slice(start, next === -1 ? migration.length : next);
}

describe("System V3 governed Combined Results calculation", () => {
  it("freezes a bounded deterministic input snapshot instead of trusting client result rows", () => {
    const snapshot = body("private.v3_combined_calculation_snapshot");
    expect(snapshot).toContain("v_participant_count not between 1 and 500");
    expect(snapshot).toContain("v_source_count not between 1 and 100");
    expect(snapshot).toContain("v_raw_entry_count > 100000");
    expect(snapshot).toContain("v_bytes > 2097152");
    expect(snapshot).toContain("extensions.digest");
    expect(snapshot).toContain("televoting.vote_submissions");
    expect(snapshot).toContain("televoting.vote_entries");
    expect(snapshot).toContain("televoting.round_results");
    expect(snapshot).toContain("televoting.external_score_entries");
    expect(snapshot).toContain("binding.edition_id is distinct from p_edition_id");
    expect(snapshot).toContain("round_row.edition_id is distinct from v_remote_edition_id");
  });

  it("claims the human Organizer R2 operation before trusted server computation", () => {
    const begin = body("public.v3_begin_combined_result_calculation");
    expect(begin).toContain("studio2_access_allowed('voting.manage', p_edition_id, false)");
    expect(begin).toContain("private.v3_combined_remote_edition(p_edition_id)");
    expect(begin).toContain("private.studio2_claim_operation(");
    expect(begin).toContain("'results.calculate'");
    expect(begin).toContain("'R2'");
    expect(begin).toContain("'expectedConfigVersion', p_expected_config_version");
    expect(begin).toContain("'expectedStateVersion', p_expected_state_version");
    expect(begin).toContain("'expectedCalculationVersion', p_expected_calculation_version");
    expect(begin).toContain("public.v3_combined_result_preflight(");
    expect(begin).toContain("'recalculate'");
  });

  it("binds the first trusted snapshot to the operation and rejects semantic input drift", () => {
    const serviceSnapshot = body("public.v3_combined_result_calculation_snapshot_service");
    expect(migration).toContain("private.v3_combined_calculation_claims");
    expect(serviceSnapshot).toContain("private.studio2_request_is_service_role()");
    expect(serviceSnapshot).toContain("v_aggregation.config_version is distinct from v_expected_config");
    expect(serviceSnapshot).toContain("v_aggregation.state_version is distinct from v_expected_state");
    expect(serviceSnapshot).toContain("v_aggregation.calculation_version is distinct from v_expected_calculation");
    expect(serviceSnapshot).toContain("on conflict (operation_id) do nothing");
    expect(serviceSnapshot).toContain("v_claim.input_fingerprint is distinct from (v_snapshot ->> 'fingerprint')");
    expect(serviceSnapshot).toContain("'reason', 'input_snapshot_changed'");
  });

  it("keeps result payload commit service-only and revalidates snapshot plus three-way CAS", () => {
    const commit = body("public.v3_commit_combined_result_calculation_service");
    expect(commit).toContain("private.studio2_request_is_service_role()");
    expect(commit).toContain("for update;");
    expect(commit).toContain("v_aggregation.config_version is distinct from v_expected_config");
    expect(commit).toContain("v_aggregation.state_version is distinct from v_expected_state");
    expect(commit).toContain("v_aggregation.calculation_version is distinct from v_expected_calculation");
    expect(commit).toContain("(v_snapshot ->> 'fingerprint') is distinct from v_claim.input_fingerprint");
    expect(commit).toContain("p_engine_version is distinct from 'component-pool-v2'");
    expect(commit).toContain("v_component_count <> v_component_source_count * v_participant_count");
    expect(migration).toContain(
      "grant execute on function public.v3_commit_combined_result_calculation_service(\n  uuid, text, text, jsonb, jsonb, jsonb\n) to service_role;",
    );
    expect(migration).not.toContain(
      "public.v3_commit_combined_result_calculation_service(\n  uuid, text, text, jsonb, jsonb, jsonb\n) to authenticated",
    );
  });

  it("stores one atomic calculation without turning calculation metadata into configuration drift", () => {
    const commit = body("public.v3_commit_combined_result_calculation_service");
    expect(commit).toContain("set_config('solaris.v3_combined_config_batch', '1', true)");
    expect(commit).toContain("televoting.televote_aggregation_sources");
    expect(commit).toContain("televoting.combined_televote_component_results");
    expect(commit).toContain("televoting.combined_televote_results");
    expect(commit).toContain("calculation_version = v_next_calculation");
    expect(commit).toContain("results_outdated = false");
    expect(commit).toContain("v_receipt.actor_id");
    expect(commit).toContain("insert into televoting.admin_audit_log");
    expect(commit).toContain("'results.calculated'");
    expect(commit).toContain("status = 'succeeded'");
    expect(commit).toContain("completed_at = now()");
  });

  it("allows the trusted server to fail a stuck processing receipt without exposing that mutation to browsers", () => {
    const fail = body("public.v3_fail_combined_result_calculation_service");
    const failReceipt = body("private.v3_fail_combined_calculation_receipt");
    expect(fail).toContain("private.studio2_request_is_service_role()");
    expect(failReceipt).toContain("status = 'failed'");
    expect(failReceipt).toContain("completed_at = now()");
    expect(failReceipt).toContain("receipt.command = 'results.calculate'");
    expect(migration).toContain(
      "grant execute on function public.v3_fail_combined_result_calculation_service(uuid, text, jsonb)\n  to service_role;",
    );
  });

  it("uses authenticated identity only for begin and requires configured service role for snapshot/commit", () => {
    expect(server).toContain("requireMergedTelevotingAdminServer()");
    expect(server).toContain("createSolarisAuthenticatedClientServer()");
    expect(server).toContain('"v3_begin_combined_result_calculation"');
    expect(server).toContain('process.env["SUPABASE_SERVICE_ROLE_KEY"]');
    expect(server).toContain('"v3_combined_result_calculation_snapshot_service"');
    expect(server).toContain('"v3_commit_combined_result_calculation_service"');
    expect(server).toContain('"v3_fail_combined_result_calculation_service"');
    expect(server).toContain("computeCombined({");
    expect(server).toContain("COMBINED_ENGINE_VERSION");
    expect(server).not.toContain("combined_televote_results\").insert");
    expect(server).not.toContain("combined_televote_component_results\").insert");
  });

  it("keeps the migration transactional", () => {
    expect(migration.trimStart().toLowerCase().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().toLowerCase().endsWith("commit;")).toBe(true);
  });
});
