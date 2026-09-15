import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = readdirSync(resolve(process.cwd(), "supabase/migrations")).find((name) =>
  name.endsWith("_permission_engine_v2_national_final_rpc_cutover.sql"),
);
if (!migrationName) throw new Error("national-final cutover migration missing");

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations", migrationName), "utf8");
const historical = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260822142000_country_historical_national_finals.sql"),
  "utf8",
);

function block(schema: "public" | "private", name: string) {
  const marker = `create or replace function ${schema}.${name}`;
  const lower = migration.toLowerCase();
  const start = lower.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = lower.indexOf("create or replace function", start + marker.length);
  return migration.slice(start, next === -1 ? migration.length : next);
}

describe("national-final Permission Engine cutover", () => {
  it("preserves country ownership and strict confirmation capability checks", () => {
    const helper = block("private", "studio2_can_manage_country_national_final_scope");
    expect(helper).toContain("from public.country_accounts ca");
    expect(helper).toContain("ca.status = 'active'");
    expect(helper).toContain("'confirmation.manage'");
    expect(helper).toContain("p_require_global");
    expect(helper).toContain("p_edition_id");
    expect(helper).not.toContain("public.has_role");
  });

  it("keeps the all-history view on global authorization", () => {
    const helper = block("public", "can_manage_country_national_finals");
    expect(helper).toContain("studio2_can_manage_country_national_final_scope");
    expect(helper).toContain("null");
    expect(helper).toContain("true");
    expect(historical).toContain("public.can_manage_country_national_finals(_country_id)");
  });

  it("authorizes individual mutations by edition scope", () => {
    const names = [
      "delete_country_historical_national_final",
      "save_country_historical_national_final",
      "set_country_national_final_publication",
      "set_country_national_final_result_order",
      "set_country_national_final_winner",
    ];
    for (const name of names) {
      const fn = block("public", name);
      expect(fn).toContain("studio2_can_manage_country_national_final_scope");
      expect(fn).not.toContain("public.has_role");
    }
    expect(block("public", "delete_country_historical_national_final")).toContain(
      "coalesce(nf.edition_id, s.edition_id)",
    );
    for (const name of names.slice(2)) {
      expect(block("public", name)).toContain("v_scope_edition_id := coalesce(");
    }
  });

  it("requires source and destination authorization when moving a historical final", () => {
    const save = block("public", "save_country_historical_national_final");
    expect(save).toContain("v_existing_edition_id");
    expect(save).toContain("v_existing_edition_id is distinct from _edition_id");
  });

  it("removes anonymous execution from the management surface", () => {
    expect(migration.match(/from public, anon;/g)?.length).toBeGreaterThanOrEqual(7);
    expect(migration.match(/to authenticated, service_role;/g)?.length).toBeGreaterThanOrEqual(7);
  });

  it("does not enable the rollout flag", () => {
    expect(migration).not.toContain("update public.studio2_feature_flags");
    expect(migration).not.toContain("insert into public.studio2_feature_flags");
  });
});
