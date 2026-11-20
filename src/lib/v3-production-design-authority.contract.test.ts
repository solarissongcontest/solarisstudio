import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261024201500_v3_production_design_authority.sql",
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

describe("V3 Production Design current-main authority", () => {
  it("uses a semantic additive S13 contract and never embeds hosted Supabase", () => {
    expect(migration).toContain("'v3.production-design-authority-v1'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).not.toMatch(/https:\/\/[^\s'\"]+\.supabase\.co/i);
  });

  it("makes the exact reviewed Production state part of deterministic CAS", () => {
    const projection = functionBody("public.admin_production_design_projection(", "projection");
    expect(projection).toContain("studio2_access_allowed('edition.manage', p_edition_id, true)");
    expect(projection).toContain("private.v3_production_design_snapshot(p_edition_id, p_show_id)");
    expect(projection).toContain("private.v3_production_design_state_version(v_snapshot)");

    const snapshot = functionBody("private.v3_production_design_snapshot(", "snapshot");
    expect(snapshot).toContain("'productionConfigVersion'");
    expect(snapshot).toContain("'broadcastSourceShowId'");
    expect(snapshot).toContain("'broadcastSource'");
  });

  it("serializes the edition, stabilizes participant counts and rejects stale review", () => {
    const apply = functionBody("public.admin_apply_production_design(", "apply");
    expect(apply).toContain("hashtextextended('v3-production-design:' || p_edition_id::text, 0)");
    expect(apply).toContain("lock table public.participants in share mode");
    expect(apply).toContain("v_before_version is distinct from v_expected");
    expect(apply).toContain("'VERSION_CONFLICT'");
    expect(apply).toContain("'currentStateVersion', v_before_version");
  });

  it("fails closed on operation shape and exact edition show-set drift", () => {
    const apply = functionBody("public.admin_apply_production_design(", "apply");
    expect(apply).toContain("v_mode not in ('edition_default', 'show_override', 'show_reset')");
    expect(apply).toContain("jsonb_typeof(v_request -> 'themeConfig') is distinct from 'object'");
    expect(apply).toContain("jsonb_typeof(v_request -> 'broadcastConfig') is distinct from 'object'");
    expect(apply).toContain("jsonb_typeof(v_request -> 'scoreboardConfig') is distinct from 'object'");
    expect(apply).toContain("Duplicate show id in showConfigs");
    expect(apply).toContain("showConfigs contains a show outside the reviewed edition");
    expect(apply).toContain("The edition show set changed since review");
  });

  it("keeps the consequential mutation behind canonical S2 receipts", () => {
    const apply = functionBody("public.admin_apply_production_design(", "apply");
    expect(apply).toContain("private.studio2_claim_operation(");
    expect(apply).toContain("v_command text := 'edition.update'");
    expect(apply).toContain("'R2'");
    expect(apply).toContain("private.studio2_complete_operation(v_canonical_operation_id, v_result)");
    expect(apply).toContain("private.studio2_fail_operation(");
    expect(apply).toContain("'receiptId', v_canonical_operation_id");
  });

  it("never edits shared/public themes in place and keeps the write atomic", () => {
    const apply = functionBody("public.admin_apply_production_design(", "apply");
    expect(apply).toContain("current_theme.is_public is true");
    expect(apply).toContain("other_edition.id <> p_edition_id");
    expect(apply).toContain("other_show.edition_id <> p_edition_id");
    expect(apply).toContain("insert into public.themes");
    expect(apply).toContain("update public.editions");
    expect(apply).toContain("update public.shows");
  });

  it("writes edition-scoped audit evidence and reuses canonical event vocabulary", () => {
    const apply = functionBody("public.admin_apply_production_design(", "apply");
    expect(apply).toContain("actor_id, action, table_name, record_id, edition_id, before_data, after_data");
    expect(apply).toContain("'production_design_defaults_saved'");
    expect(apply).toContain("'production_show_override_saved'");
    expect(apply).toContain("'production_show_override_reset'");
    expect(apply).toContain("'edition.changed'");
    expect(apply).toContain("'show.changed'");
    expect(apply).not.toContain("'production.design_changed'");
  });
});
