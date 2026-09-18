import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = readdirSync(resolve(process.cwd(), "supabase/migrations")).find((name) =>
  name.endsWith("_permission_engine_v2_rulebook_capability_cutover.sql"),
);
if (!migrationName) throw new Error("Rulebook capability cutover migration missing");

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations", migrationName), "utf8");

function normalized(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

describe("Rulebook Permission Engine capability cutover", () => {
  it("maps private rulebook reads to rules.read", () => {
    expect(migration).toContain("('public.admin_rulebook_releases()', 'rules.read')");
  });

  it("maps draft mutation operations to rules.edit", () => {
    for (const signature of [
      "public.admin_archive_rulebook_release(uuid)",
      "public.admin_create_rulebook_release(text,text,text,text)",
      "public.admin_delete_rulebook_change(uuid,text)",
      "public.admin_upsert_rulebook_change(uuid,text,text,jsonb,jsonb,text)",
    ]) {
      expect(migration).toContain(`('${signature}', 'rules.edit')`);
    }
  });

  it("maps publication to rules.publish", () => {
    expect(migration).toContain(
      "('public.admin_publish_rulebook_release(uuid,timestamp with time zone)', 'rules.publish')",
    );
  });

  it("uses source-preserving rewrites and verifies the legacy helper is gone", () => {
    const sql = normalized(migration);
    expect(sql).toContain("v_def := pg_get_functiondef(v_oid)");
    expect(sql.toLowerCase()).toContain("expected exactly one rulebook_is_organizer gate");
    expect(sql).toContain("public.studio2_access_allowed(%L, null, false)");
    expect(sql).toContain("drop function public.rulebook_is_organizer();");
    expect(sql.toLowerCase()).toContain("live rulebook semantic organizer references remain");
  });

  it("preserves public RPC ACLs while removing the obsolete helper surface", () => {
    for (const signature of [
      "public.admin_rulebook_releases()",
      "public.admin_archive_rulebook_release(uuid)",
      "public.admin_create_rulebook_release(text,text,text,text)",
      "public.admin_delete_rulebook_change(uuid,text)",
      "public.admin_upsert_rulebook_change(uuid,text,text,jsonb,jsonb,text)",
      "public.admin_publish_rulebook_release(uuid,timestamp with time zone)",
    ]) {
      expect(migration).toContain(`revoke all on function ${signature} from public, anon;`);
      expect(migration).toContain(`grant execute on function ${signature} to authenticated, service_role;`);
    }
  });

  it("does not enable Permission Engine v2", () => {
    expect(migration).not.toContain("update public.studio2_feature_flags");
    expect(migration).not.toContain("insert into public.studio2_feature_flags");
    expect(migration).not.toContain("'permission_engine_v2'");
  });
});
