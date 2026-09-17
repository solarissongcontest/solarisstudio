import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = readdirSync(resolve(process.cwd(), "supabase/migrations")).find((name) =>
  name.endsWith("_permission_engine_v2_storage_rls_cutover.sql"),
);
if (!migrationName) throw new Error("Storage RLS cutover migration missing");

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations", migrationName), "utf8");

function normalized(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

describe("Storage Permission Engine RLS cutover", () => {
  it("removes all seven legacy storage Organizer policy predicates", () => {
    for (const policy of [
      "Organizers can read beta screenshots",
      "country media bucket owner delete",
      "country media bucket owner insert",
      "country media bucket owner update",
      "organizers delete edition artwork",
      "organizers update edition artwork",
      "organizers upload edition artwork",
    ]) {
      expect(migration).toContain(`drop policy if exists \"${policy}\" on storage.objects;`);
      expect(migration).toContain(`create policy \"${policy}\"`);
    }
    expect(migration).not.toContain("has_role(");
  });

  it("keeps beta screenshots as elevated rollout administration", () => {
    const sql = normalized(migration);
    expect(sql).toContain("bucket_id = 'beta-feedback'::text and public.studio2_access_allowed('rollout.manage', null, false)");
    expect(migration).not.toContain("'rollout.read'");
  });

  it("preserves country ownership alongside global delegation management", () => {
    const sql = normalized(migration);
    expect(sql).toContain("public.studio2_access_allowed('delegation.manage', null, false)");
    expect(sql).toContain("from public.country_accounts ca where ca.user_id = auth.uid()");
    expect(sql).toContain("ca.country_id::text = (storage.foldername(objects.name))[1]");
  });

  it("supports global or folder-scoped edition.manage for edition artwork", () => {
    const sql = normalized(migration);
    expect(sql).toContain("create or replace function private.studio2_storage_edition_access_allowed");
    expect(sql).toContain("public.studio2_access_allowed('edition.manage', null, p_strict_before_cutover)");
    expect(sql).toContain("v_folder := (storage.foldername(p_object_name))[1]");
    expect(sql).toContain("public.studio2_access_allowed('edition.manage', v_edition_id, p_strict_before_cutover)");
    expect(sql).toContain("private.studio2_storage_edition_access_allowed(objects.name, false)");
  });

  it("fails malformed edition-artwork paths closed for scoped managers", () => {
    expect(migration).toContain("v_folder !~*");
    expect(migration).toContain("return false;");
  });

  it("keeps the private storage resolver directly uncallable", () => {
    const sql = normalized(migration);
    expect(sql).toContain(
      "revoke all on function private.studio2_storage_edition_access_allowed(text, boolean) from public, anon, authenticated, service_role;",
    );
  });

  it("does not enable Permission Engine v2", () => {
    expect(migration).not.toContain("update public.studio2_feature_flags");
    expect(migration).not.toContain("insert into public.studio2_feature_flags");
    expect(migration).not.toContain("'permission_engine_v2'");
  });
});
