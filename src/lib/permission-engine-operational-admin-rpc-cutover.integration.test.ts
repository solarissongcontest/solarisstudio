import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = readdirSync(resolve(process.cwd(), "supabase/migrations")).find((name) =>
  name.endsWith("_permission_engine_v2_operational_admin_rpc_cutover.sql"),
);
if (!migrationName) throw new Error("operational admin RPC cutover migration missing");

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations", migrationName), "utf8");

function block(name: string) {
  const marker = `create or replace function public.${name}`;
  const lower = migration.toLowerCase();
  const start = lower.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = lower.indexOf("create or replace function", start + marker.length);
  return migration.slice(start, next === -1 ? migration.length : next);
}

describe("operational admin Permission Engine RPC cutover", () => {
  it("maps the five legacy admin RPCs to their exact capabilities", () => {
    const mappings = [
      ["admin_edition_health_summary", "studio2_access_allowed('edition.read', _edition_id, true)"],
      ["admin_recalculate_show_results", "studio2_access_allowed('results.verify', v_edition_id, true)"],
      ["admin_set_jury_voting_status", "studio2_access_allowed('voting.manage', target_show.edition_id, true)"],
      ["admin_set_participation_status", "studio2_access_allowed('entry.approve', _edition_id, true)"],
      ["admin_set_show_running_order", "studio2_access_allowed('entry.edit', v_edition_id, true)"],
    ] as const;

    for (const [name, decision] of mappings) {
      const fn = block(name);
      expect(fn).toContain(decision);
      expect(fn).not.toContain("has_role");
    }
  });

  it("resolves show-scoped permissions through the canonical show edition", () => {
    const recalc = block("admin_recalculate_show_results");
    expect(recalc).toContain("select s.edition_id into v_edition_id");
    expect(recalc).toContain("where s.id = _show_id");

    const jury = block("admin_set_jury_voting_status");
    expect(jury).toContain("select * into target_show");
    expect(jury).toContain("where id = _show_id");
    expect(jury.indexOf("studio2_access_allowed('voting.manage', target_show.edition_id, true)")).toBeLessThan(
      jury.indexOf("raise exception 'Show not found'"),
    );

    const runningOrder = block("admin_set_show_running_order");
    expect(runningOrder).toContain("select s.edition_id into v_edition_id");
    expect(runningOrder).toContain("where s.id = _show_id");
  });

  it("keeps unknown show ids on the global-capability fallback path", () => {
    for (const name of ["admin_recalculate_show_results", "admin_set_show_running_order"]) {
      const fn = block(name);
      expect(fn).toContain("v_edition_id uuid");
      expect(fn).not.toContain("coalesce(v_edition_id");
    }

    const jury = block("admin_set_jury_voting_status");
    expect(jury).toContain("target_show.edition_id");
    expect(jury.indexOf("studio2_access_allowed('voting.manage', target_show.edition_id, true)")).toBeLessThan(
      jury.indexOf("if target_show is null"),
    );
  });

  it("preserves the existing operational write paths", () => {
    expect(block("admin_recalculate_show_results")).toContain("recalculate_show_results_internal(_show_id)");

    const jury = block("admin_set_jury_voting_status");
    expect(jury).toContain("insert into public.jury_voting_windows");
    expect(jury).toContain("on conflict (show_id) do update set");

    const participation = block("admin_set_participation_status");
    expect(participation).toContain("update public.participants p");
    expect(participation).toContain("update public.entries");

    const runningOrder = block("admin_set_show_running_order");
    expect(runningOrder).toContain("Running order must contain every show participant exactly once.");
    expect(runningOrder).toContain("set running_order = null");
    expect(runningOrder).toContain("set running_order = v_position");

    const health = block("admin_edition_health_summary");
    expect(health).toContain("'jury_issues', v_jury_issues");
    expect(health).toContain("'result_issues', v_result_issues");
  });

  it("keeps all five RPCs authenticated/service-role only", () => {
    expect(migration.match(/from public, anon;/g)?.length).toBeGreaterThanOrEqual(5);
    expect(migration.match(/to authenticated, service_role;/g)?.length).toBeGreaterThanOrEqual(5);
  });

  it("does not enable Permission Engine v2", () => {
    expect(migration).not.toContain("update public.studio2_feature_flags");
    expect(migration).not.toContain("insert into public.studio2_feature_flags");
  });
});
