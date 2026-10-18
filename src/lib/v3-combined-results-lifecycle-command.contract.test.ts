import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261018234500_v3_combined_results_lifecycle_commands.sql",
  ),
  "utf8",
);
const preflight = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261018210000_v3_combined_results_versions_preflight.sql",
  ),
  "utf8",
);
const projection = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261017001020_v3_s14_televote_projection_replay_hardening.sql",
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

describe("System V3 governed Combined Results lifecycle", () => {
  it("reuses the existing exact-edition capability and consequence-aware preflight", () => {
    const transition = body("public.v3_transition_combined_result");
    expect(transition).toContain("studio2_access_allowed('voting.manage', p_edition_id, false)");
    expect(transition).toContain("private.v3_combined_remote_edition(p_edition_id)");
    expect(transition).toContain("v_aggregation.edition_id is distinct from v_remote_edition_id");
    expect(transition).toContain("public.v3_combined_result_preflight(");
    expect(preflight).toContain("'lock'");
    expect(preflight).toContain("'publish'");
    expect(preflight).toContain("'unlock'");
  });

  it("claims the canonical operation before mutable CAS validation and maps risk by action", () => {
    const transition = body("public.v3_transition_combined_result");
    const claim = transition.indexOf("private.studio2_claim_operation(");
    const lock = transition.indexOf("for update;");
    const version = transition.indexOf("message = 'VERSION_CONFLICT'");
    expect(claim).toBeGreaterThanOrEqual(0);
    expect(lock).toBeGreaterThan(claim);
    expect(version).toBeGreaterThan(lock);
    expect(transition).toContain("when 'lock' then 'results.lock'");
    expect(transition).toContain("when 'publish' then 'publication.publish'");
    expect(transition).toContain("else 'results.unlock'");
    expect(transition).toContain("case when v_action = 'lock' then 'R2' else 'R3' end");
    expect(transition).toContain("public.studio2_reconcile_operation(v_operation_id)");
  });

  it("binds lock/publish/unlock to all three expected versions", () => {
    const transition = body("public.v3_transition_combined_result");
    expect(transition).toContain("v_aggregation.config_version is distinct from p_expected_config_version");
    expect(transition).toContain("v_aggregation.state_version is distinct from p_expected_state_version");
    expect(transition).toContain("v_aggregation.calculation_version is distinct from p_expected_calculation_version");
    expect(transition).toContain("errcode = 'PT409', message = 'VERSION_CONFLICT'");
    expect(transition).toContain("v_action = 'lock' and v_aggregation.status <> 'calculated'");
    expect(transition).toContain("v_action = 'publish' and v_aggregation.status <> 'locked'");
    expect(transition).toContain("v_action = 'unlock' and v_aggregation.status not in ('locked', 'published')");
  });

  it("uses the existing S14 publication bridge and refuses ambiguous publication success", () => {
    const transition = body("public.v3_transition_combined_result");
    expect(projection).toContain("private.v3_sync_published_televote_aggregation");
    expect(transition).toContain("status = 'published'");
    expect(transition).toContain("private.v3_televote_result_projection_sources");
    expect(transition).toContain("source.source_type = 'combined'");
    expect(transition).toContain("source.source_id = p_aggregation_id::text");
    expect(transition).toContain("v_projection.source_version is distinct from p_expected_calculation_version");
    expect(transition).toContain("SOLARIS_PROJECTION_NOT_CURRENT");
  });

  it("retracts only the exact published Combined projection on published unlock", () => {
    const withdraw = body("private.v3_withdraw_combined_published_projection");
    const transition = body("public.v3_transition_combined_result");
    expect(withdraw).toContain("source.source_type = 'combined'");
    expect(withdraw).toContain("source.source_id = p_aggregation_id::text");
    expect(withdraw).toContain("solaris.v3_televote_projection_write");
    expect(withdraw).toContain("solaris.v3_televote_projection_bulk_replace");
    expect(withdraw).toContain("delete from public.televote_votes");
    expect(withdraw).toContain("delete from private.v3_televote_result_projection_sources");
    expect(withdraw).toContain("perform public.sync_show_results_from_votes(v_source.show_id)");
    expect(transition).toContain("if v_previous_status = 'published' then");
    expect(transition).toContain("private.v3_withdraw_combined_published_projection(");
  });

  it("records immutable evidence without exposing a new browser table writer", () => {
    const transition = body("public.v3_transition_combined_result");
    const normalized = migration.toLowerCase();
    expect(transition).toContain("insert into televoting.admin_audit_log");
    expect(transition).toContain("'results.locked'");
    expect(transition).toContain("'publication.changed'");
    expect(transition).toContain("private.studio2_complete_operation(v_operation_id, v_result)");
    expect(normalized).toContain("from public, anon;");
    expect(normalized).toContain("to authenticated, service_role;");
    expect(normalized).not.toContain("grant insert on table");
    expect(normalized).not.toContain("grant update on table");
    expect(normalized).not.toContain("grant delete on table");
  });

  it("keeps the migration transactional", () => {
    expect(migration.trimStart().toLowerCase().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().toLowerCase().endsWith("commit;")).toBe(true);
  });
});
