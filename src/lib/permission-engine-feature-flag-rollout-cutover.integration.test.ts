import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = readdirSync(resolve(process.cwd(), "supabase/migrations")).find((name) =>
  name.endsWith("_permission_engine_v2_feature_flag_rollout_cutover.sql"),
);
if (!migrationName) throw new Error("feature-flag rollout cutover migration missing");

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations", migrationName), "utf8");

function normalized(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

describe("feature-flag rollout Permission Engine cutover", () => {
  it("uses non-strict rollout.manage for global and edition-scoped authorization", () => {
    expect(migration).toContain("public.studio2_access_allowed('rollout.manage', null, false)");
    expect(migration).toContain(
      "public.studio2_access_allowed('rollout.manage', affected_scope.edition_id, false)",
    );
    expect(migration).not.toContain("private.studio2_user_has_capability");
    expect(migration).not.toContain("has_role");
  });

  it("preserves scope-union locking and validation semantics", () => {
    const sql = normalized(migration);
    expect(sql).toContain("array_position(coalesce(p_user_ids, '{}'::uuid[]), null) is not null");
    expect(sql).toContain("array_position(coalesce(p_edition_ids, '{}'::uuid[]), null) is not null");
    expect(sql).toContain("perform pg_advisory_xact_lock(hashtextextended('studio2_feature_flag:' || p_key, 0));");
    expect(sql).toContain("select edition_ids into v_existing_scopes from public.studio2_feature_flags where key = p_key for update;");
    expect(sql).toContain("unnest(coalesce(v_existing_scopes, '{}'::uuid[]) || v_requested_scopes)");
    expect(sql).toContain("if (found and cardinality(v_existing_scopes) = 0) or cardinality(v_requested_scopes) = 0 then");
  });

  it("preserves service-role bypass and requires all affected scopes otherwise", () => {
    const sql = normalized(migration);
    expect(sql).toContain("v_is_service boolean := coalesce(auth.role(), '') = 'service_role';");
    expect(sql).toContain("v_can_manage_scopes := not exists (");
    expect(sql).toContain("if not v_is_service and not v_can_manage_scopes then");
    expect(sql).toContain(
      "raise exception 'Feature rollout management capability required for every existing and requested edition scope' using errcode = '42501';",
    );
  });

  it("keeps the RPC authenticated/service-role only", () => {
    const sql = normalized(migration);
    expect(sql).toContain(
      "revoke all on function public.studio2_set_feature_flag(text, boolean, boolean, uuid[], uuid[]) from public, anon;",
    );
    expect(sql).toContain(
      "grant execute on function public.studio2_set_feature_flag(text, boolean, boolean, uuid[], uuid[]) to authenticated, service_role;",
    );
  });

  it("does not directly toggle the Permission Engine v2 flag", () => {
    expect(migration).not.toContain("'permission_engine_v2'");
  });
});
