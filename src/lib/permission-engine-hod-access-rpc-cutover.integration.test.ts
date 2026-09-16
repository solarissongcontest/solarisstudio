import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = readdirSync(resolve(process.cwd(), "supabase/migrations")).find((name) =>
  name.endsWith("_permission_engine_v2_hod_access_rpc_cutover.sql"),
);
if (!migrationName) throw new Error("HOD access RPC cutover migration missing");

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations", migrationName), "utf8");

function block(qualifiedName: string) {
  const marker = `create or replace function ${qualifiedName}`;
  const lower = migration.toLowerCase();
  const start = lower.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = lower.indexOf("create or replace function", start + marker.length);
  return migration.slice(start, next === -1 ? migration.length : next);
}

describe("HOD access Permission Engine RPC cutover", () => {
  it("moves the country cockpit to non-strict edition-scoped confirmation.manage", () => {
    const fn = block("public.studio2_country_cockpit");
    expect(fn).toContain("studio2_access_allowed('confirmation.manage', p_edition_id, false)");
    expect(fn).toContain("Edition not found: %");
    expect(fn).toContain("studio2_hod_context(p_edition_id, pc.country_id)");
    expect(fn).not.toContain("has_role");
  });

  it("preserves country-owner access to all relevant HOD editions", () => {
    const fn = block("public.studio2_hod_editions");
    expect(fn).toContain("public.owns_country(v_actor, p_country_id)");
    expect(fn).toContain("v_owns_country");
    expect(fn).toContain("or public.studio2_access_allowed('confirmation.manage', e.id, false)");
    expect(fn).not.toContain("has_role");
  });

  it("keeps specialist access edition-scoped while legacy Organizers remain compatible before cutover", () => {
    const fn = block("public.studio2_hod_editions");
    expect(fn).toContain("access_edition.id");
    expect(fn).toContain("'confirmation.manage',\n         access_edition.id,\n         false");
    expect(fn).toContain("p.edition_id = access_edition.id");
    expect(fn).toContain("en.edition_id = access_edition.id");
  });

  it("preserves participation and entry based relevance filtering", () => {
    const fn = block("public.studio2_hod_editions");
    expect(fn).toContain("from public.participants p");
    expect(fn).toContain("from public.entries en");
    expect(fn).toContain("p.country_id = p_country_id");
    expect(fn).toContain("en.country_id = p_country_id");
  });

  it("keeps both browser RPCs authenticated/service-role only", () => {
    expect(migration).toContain(
      "revoke all on function public.studio2_country_cockpit(uuid) from public, anon;",
    );
    expect(migration).toContain(
      "grant execute on function public.studio2_country_cockpit(uuid) to authenticated, service_role;",
    );
    expect(migration).toContain(
      "revoke all on function public.studio2_hod_editions(uuid) from public, anon;",
    );
    expect(migration).toContain(
      "grant execute on function public.studio2_hod_editions(uuid) to authenticated, service_role;",
    );
  });

  it("does not modify the service-only legacy HOD context helper or enable Permission Engine v2", () => {
    expect(migration).not.toContain("create or replace function public.studio2_hod_context_legacy_roster");
    expect(migration).not.toContain("update public.studio2_feature_flags");
    expect(migration).not.toContain("insert into public.studio2_feature_flags");
  });
});
