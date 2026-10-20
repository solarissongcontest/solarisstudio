import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261020093000_v3_production_design_authority.sql",
  ),
  "utf8",
);

function functionBody(signature: string, delimiter: string) {
  const start = migration.indexOf(`create or replace function ${signature}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const bodyStart = migration.indexOf(`as $${delimiter}$`, start);
  expect(bodyStart).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf(`$${delimiter}$;`, bodyStart + delimiter.length + 5);
  expect(end).toBeGreaterThan(bodyStart);
  return migration.slice(start, end + delimiter.length + 3);
}

describe("V3 Production Design authority", () => {
  it("is an additive forward-fix migration and never embeds hosted Supabase", () => {
    expect(migration).toContain("'v3.production-design-authority-v1'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).not.toMatch(/https:\/\/[^\s'"]+\.supabase\.co/i);
  });

  it("adds explicit compatibility versions for edition and show production state", () => {
    expect(migration).toContain(
      "add column if not exists production_config_version bigint not null default 1",
    );
    expect(migration).toContain("v3_editions_production_config_version");
    expect(migration).toContain("v3_shows_production_config_version");
    expect(migration).toContain("private.v3_bump_production_config_version()");
  });

  it("provides a bounded exact-edition read projection with deterministic CAS state", () => {
    const body = functionBody("public.admin_production_design_projection(", "projection");
    expect(body).toContain("studio2_access_allowed('edition.manage', p_edition_id, true)");
    expect(body).toContain("private.v3_production_design_snapshot(p_edition_id, p_show_id)");
    expect(body).toContain("private.v3_production_design_state_version(v_snapshot)");
    expect(body).toContain("'stateVersion'");
    expect(body).toContain("'serverTime'");
  });

  it("serializes one exact edition and fails closed on stale reviewed state", () => {
    const body = functionBody("public.admin_apply_production_design(", "apply");
    expect(body).toContain("hashtextextended('v3-production-design:' || p_edition_id::text, 0)");
    expect(body).toContain("where edition_row.id = p_edition_id\n  for update");
    expect(body).toContain("where show_row.id = v_show_id\n      and show_row.edition_id = p_edition_id");
    expect(body).toContain("v_before_version is distinct from v_expected");
    expect(body).toContain("'VERSION_CONFLICT'");
    expect(body).toContain("'currentStateVersion', v_before_version");
  });

  it("uses the canonical operation/idempotency boundary and durable receipt", () => {
    const body = functionBody("public.admin_apply_production_design(", "apply");
    expect(body).toContain("private.studio2_claim_operation(");
    expect(body).toContain("v_command text := 'edition.update'");
    expect(body).toContain("'R2'");
    expect(body).toContain("'expectedStateVersion', v_expected");
    expect(body).toContain("private.studio2_complete_operation(v_canonical_operation_id, v_result)");
    expect(body).toContain("private.studio2_fail_operation(");
    expect(body).toContain("'receiptId', v_canonical_operation_id");
  });

  it("requires edition-default requests to cover the exact current show set", () => {
    const body = functionBody("public.admin_apply_production_design(", "apply");
    expect(body).toContain("jsonb_array_elements(v_show_configs)");
    expect(body).toContain("Duplicate show id in showConfigs");
    expect(body).toContain("showConfigs contains a show outside the reviewed edition");
    expect(body).toContain("The edition show set changed since review");
    expect(body).toContain("currentShowCount");
    expect(body).toContain("reviewedShowCount");
  });

  it("keeps theme creation, edition attachment and show propagation inside the server transaction", () => {
    const body = functionBody("public.admin_apply_production_design(", "apply");
    expect(body).toContain("insert into public.themes");
    expect(body).toContain("update public.editions");
    expect(body).toContain("update public.shows");
    expect(body).toContain("for v_show_config in select value from jsonb_array_elements(v_show_configs)");
    expect(body).toContain("production_config_version = production_config_version + 1");
  });

  it("does not mutate shared themes across editions or unrelated shows", () => {
    const body = functionBody("public.admin_apply_production_design(", "apply");
    expect(body).toContain("other_edition.id <> p_edition_id");
    expect(body).toContain("other_show.edition_id <> p_edition_id");
    expect(body).toContain("v_theme_id = v_edition.theme_id");
    expect(body).toContain("other_show.id <> v_show_id");
    expect(body).toContain("'Organizer-managed edition Production design'");
    expect(body).toContain("'Organizer-managed show Production override'");
    expect(body).toContain("false\n        )\n        returning id into v_theme_id");
  });

  it("writes audit evidence and reuses registered edition/show event facts", () => {
    const body = functionBody("public.admin_apply_production_design(", "apply");
    expect(body).toContain("insert into public.admin_audit_log");
    expect(body).toContain("'production_design_defaults_saved'");
    expect(body).toContain("'production_show_override_saved'");
    expect(body).toContain("'production_show_override_reset'");
    expect(body).toContain("private.v3_emit_domain_event(");
    expect(body).toContain("'edition.changed'");
    expect(body).toContain("'show.changed'");
    expect(body).not.toContain("'production.design_changed'");
  });

  it("exposes only authenticated command/read RPCs and reloads PostgREST schema", () => {
    expect(migration).toContain(
      "grant execute on function public.admin_production_design_projection(uuid, uuid)\n  to authenticated, service_role",
    );
    expect(migration).toContain(
      "grant execute on function public.admin_apply_production_design(\n  uuid, jsonb, text, uuid, text, text\n) to authenticated, service_role",
    );
    expect(migration).toContain("notify pgrst, 'reload schema'");
  });
});
