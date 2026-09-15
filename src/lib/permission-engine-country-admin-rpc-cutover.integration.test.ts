import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = readdirSync(resolve(process.cwd(), "supabase/migrations")).find((name) =>
  name.endsWith("_permission_engine_v2_country_admin_rpc_cutover.sql"),
);
if (!migrationName) throw new Error("country admin RPC cutover migration missing");

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations", migrationName), "utf8");

function block(name: string) {
  const marker = `create or replace function public.${name}`;
  const lower = migration.toLowerCase();
  const start = lower.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = lower.indexOf("create or replace function", start + marker.length);
  return migration.slice(start, next === -1 ? migration.length : next);
}

describe("country admin Permission Engine RPC cutover", () => {
  it("maps global country administration to delegation.manage", () => {
    for (const name of [
      "admin_country_accounts",
      "admin_set_country_account_status",
      "admin_update_country_identity",
    ]) {
      const fn = block(name);
      expect(fn).toContain("studio2_access_allowed('delegation.manage', null, true)");
      expect(fn).not.toContain("has_role");
    }
  });

  it("maps entry administration to edition-scoped entry.edit", () => {
    for (const name of [
      "admin_update_country_entry_listen_links",
      "admin_upsert_country_edition_entry",
      "admin_upsert_country_entry",
    ]) {
      const fn = block(name);
      expect(fn).toContain("studio2_access_allowed('entry.edit', _edition_id, true)");
      expect(fn).not.toContain("has_role");
    }
  });

  it("preserves the existing country-entry internal write paths", () => {
    expect(block("admin_update_country_entry_listen_links")).toContain(
      "update_country_entry_listen_links_internal",
    );
    expect(block("admin_upsert_country_edition_entry")).toContain(
      "upsert_country_edition_entry_internal",
    );
    expect(block("admin_upsert_country_entry")).toContain(
      "upsert_country_edition_entry_internal",
    );
  });

  it("keeps the six RPCs authenticated and removes anonymous execution", () => {
    expect(migration.match(/from public, anon;/g)?.length).toBeGreaterThanOrEqual(6);
    expect(migration.match(/to authenticated, service_role;/g)?.length).toBeGreaterThanOrEqual(6);
  });

  it("does not enable Permission Engine v2", () => {
    expect(migration).not.toContain("update public.studio2_feature_flags");
    expect(migration).not.toContain("insert into public.studio2_feature_flags");
  });
});
