import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationNames = readdirSync(resolve(process.cwd(), "supabase/migrations"));
const privilegeMigrationName = migrationNames.find((name) =>
  name.endsWith("_permission_engine_v2_private_rls_helper_execute_hotfix.sql"),
);
const splitMigrationName = migrationNames.find((name) =>
  name.endsWith("_permission_engine_v2_prediction_anon_policy_split.sql"),
);
if (!privilegeMigrationName) throw new Error("Private RLS helper hotfix migration missing");
if (!splitMigrationName) throw new Error("Prediction anon policy split migration missing");

const privilegeMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations", privilegeMigrationName),
  "utf8",
);
const splitMigration = readFileSync(resolve(process.cwd(), "supabase/migrations", splitMigrationName), "utf8");

function normalized(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

describe("Permission Engine private RLS helper privilege hotfix", () => {
  it("grants authenticated policy evaluation without opening anon/service execution", () => {
    const sql = normalized(privilegeMigration);

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

  it("splits anonymous and authenticated Prediction reads by database role", () => {
    const sql = normalized(splitMigration);

    expect(sql).toContain(
      'create policy "public reads published prediction rounds" on public.prediction_rounds for select to anon',
    );
    expect(sql).toContain(
      'create policy "authenticated reads prediction rounds" on public.prediction_rounds for select to authenticated',
    );
    expect(sql).toContain("public.show_publication_enabled(show_id, 'participants'::text)");
    expect(sql).toContain("or private.studio2_show_access_allowed('voting.manage', show_id, false)");
  });

  it("never references the private helper from the anon Prediction policy", () => {
    const sql = normalized(splitMigration);
    const anonStart = sql.indexOf('create policy "public reads published prediction rounds"');
    const authStart = sql.indexOf('create policy "authenticated reads prediction rounds"');
    const anonPolicy = sql.slice(anonStart, authStart);

    expect(anonStart).toBeGreaterThanOrEqual(0);
    expect(authStart).toBeGreaterThan(anonStart);
    expect(anonPolicy).not.toContain("studio2_show_access_allowed");
    expect(splitMigration).toContain("anonymous Prediction read policy still references private helper");
  });

  it("asserts the intended helper privilege boundary", () => {
    expect(privilegeMigration).toContain("has_function_privilege(");
    expect(privilegeMigration).toContain(
      "authenticated cannot execute private.studio2_can_manage_permissions through RLS",
    );
    expect(privilegeMigration).toContain(
      "anon unexpectedly gained private.studio2_can_manage_permissions EXECUTE",
    );
    expect(privilegeMigration).toContain(
      "authenticated cannot execute private.studio2_show_access_allowed through RLS",
    );
    expect(privilegeMigration).toContain(
      "anon unexpectedly gained private.studio2_show_access_allowed EXECUTE",
    );
  });

  it("does not enable Permission Engine v2", () => {
    for (const migration of [privilegeMigration, splitMigration]) {
      expect(migration).not.toContain("update public.studio2_feature_flags");
      expect(migration).not.toContain("insert into public.studio2_feature_flags");
      expect(migration).not.toContain("'permission_engine_v2'");
    }
  });
});
