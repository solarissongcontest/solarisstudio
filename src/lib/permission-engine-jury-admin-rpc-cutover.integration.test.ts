import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = readdirSync(resolve(process.cwd(), "supabase/migrations")).find((name) =>
  name.endsWith("_permission_engine_v2_jury_admin_rpc_cutover.sql"),
);
if (!migrationName) throw new Error("jury admin RPC cutover migration missing");

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations", migrationName), "utf8");

function block(name: string) {
  const marker = `create or replace function public.${name}`;
  const lower = migration.toLowerCase();
  const start = lower.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = lower.indexOf("create or replace function", start + marker.length);
  return migration.slice(start, next === -1 ? migration.length : next);
}

describe("jury admin Permission Engine RPC cutover", () => {
  it("keeps raw jury-score editing strict before authoritative cutover", () => {
    for (const name of ["assign_jury_vote", "clear_jury_point"]) {
      const fn = block(name);
      expect(fn).toContain("studio2_access_allowed('jury.ballots.manage', p_edition_id, true)");
      expect(fn).not.toContain("has_role");
    }
  });

  it("preserves capability-specialist and country-owner roster access", () => {
    const assign = block("studio2_assign_jury_member");
    expect(assign).toContain("studio2_access_allowed('jury.ballots.manage', p_edition_id, false)");
    expect(assign).toContain("public.owns_country(v_actor, p_country_id)");
    expect(assign).not.toContain("has_role");

    const remove = block("studio2_remove_jury_member");
    expect(remove).toContain("studio2_access_allowed('jury.ballots.manage', v_member.edition_id, false)");
    expect(remove).toContain("public.owns_country(v_actor, v_member.country_id)");
    expect(remove).not.toContain("has_role");
  });

  it("preserves edition-management access to the one-jury requirement", () => {
    const fn = block("studio2_set_jury_requirement");
    expect(fn).toContain("studio2_access_allowed('edition.manage', p_edition_id, false)");
    expect(fn).toContain("p_required is distinct from 1");
    expect(fn).toContain("jury_members_required = 1");
    expect(fn).not.toContain("has_role");
  });

  it("preserves existing jury vote mutation behavior", () => {
    const assign = block("assign_jury_vote");
    expect(assign).toContain("delete from public.jury_votes j");
    expect(assign).toContain("insert into public.jury_votes");
    expect(assign).toContain("j.points = p_points");

    const clear = block("clear_jury_point");
    expect(clear).toContain("delete from public.jury_votes j");
    expect(clear).toContain("get diagnostics v_count = row_count");
  });

  it("preserves roster locking and lifecycle behavior", () => {
    const assign = block("studio2_assign_jury_member");
    expect(assign).toContain("pg_advisory_xact_lock");
    expect(assign).toContain("v_assigned >= v_required");
    expect(assign).toContain("insert into public.studio2_jury_members");

    const remove = block("studio2_remove_jury_member");
    expect(remove).toContain("for update");
    expect(remove).toContain("status = 'removed'");
    expect(remove).toContain("removed_by = v_actor");
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
