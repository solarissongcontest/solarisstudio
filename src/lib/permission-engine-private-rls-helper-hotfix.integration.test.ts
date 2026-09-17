import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = readdirSync(resolve(process.cwd(), "supabase/migrations")).find((name) =>
  name.endsWith("_permission_engine_v2_private_rls_helper_execute_hotfix.sql"),
);
if (!migrationName) throw new Error("Private RLS helper hotfix migration missing");

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations", migrationName), "utf8");

function normalized(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

describe("Permission Engine private RLS helper privilege hotfix", () => {
  it("grants authenticated policy evaluation without opening anon/service execution", () => {
    const sql = normalized(migration);

    expect(sql).toContain(
      "grant execute on function private.studio2_can_manage_permissions(uuid) to authenticated;",
    );
    expect(sql).toContain(
      "grant execute on function private.studio2_show_access_allowed(text, uuid, boolean) to authenticated;",
    );
    expect(sql).toContain(
      "revoke all on function private.studio2_can_manage_permissions(uuid) from public, anon, service_role;",
    );
    expect(sql).toContain(
      "revoke all on function private.studio2_show_access_allowed(text, uuid, boolean) from public, anon, service_role;",
    );
  });

  it("keeps anonymous Prediction reads off the elevated private helper path", () => {
    const sql = normalized(migration);

    expect(sql).toContain(
      'create policy "public reads published prediction rounds" on public.prediction_rounds for select to anon, authenticated',
    );
    expect(sql).toContain("public.show_publication_enabled(show_id, 'participants'::text)");
    expect(sql).toContain(
      "or ( auth.uid() is not null and private.studio2_show_access_allowed('voting.manage', show_id, false) )",
    );
  });

  it("asserts the intended privilege boundary inside the migration", () => {
    expect(migration).toContain("has_function_privilege(");
    expect(migration).toContain("authenticated cannot execute private.studio2_can_manage_permissions through RLS");
    expect(migration).toContain("anon unexpectedly gained private.studio2_can_manage_permissions EXECUTE");
    expect(migration).toContain("authenticated cannot execute private.studio2_show_access_allowed through RLS");
    expect(migration).toContain("anon unexpectedly gained private.studio2_show_access_allowed EXECUTE");
  });

  it("does not enable Permission Engine v2", () => {
    expect(migration).not.toContain("update public.studio2_feature_flags");
    expect(migration).not.toContain("insert into public.studio2_feature_flags");
    expect(migration).not.toContain("'permission_engine_v2'");
  });
});
