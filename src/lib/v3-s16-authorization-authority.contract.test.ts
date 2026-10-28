import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = read("supabase/migrations/20261027213001_v3_s16_authorization_authority.sql");
const permissionClient = read("src/lib/permission-engine-admin.ts");
const persistence = read("src/lib/studio2-persistence.ts");

describe("S16 canonical authorization mutation authority", () => {
  test("keeps the Organizer runtime on the governed R3 command", () => {
    expect(permissionClient).toContain('rpc("studio2_apply_permission_change_r3"');
    expect(permissionClient).not.toContain('rpc("studio2_grant_capability"');
    expect(permissionClient).not.toContain('rpc("studio2_revoke_capability"');
    expect(permissionClient).not.toContain('rpc("studio2_assign_access_role"');
    expect(permissionClient).not.toContain('rpc("studio2_revoke_access_role"');
  });

  test("retires service-role compatibility writers rather than sanctioning them", () => {
    for (const signature of [
      "public.studio2_grant_capability(uuid, text, uuid, timestamptz)",
      "public.studio2_revoke_capability(uuid, text, uuid)",
      "public.studio2_assign_access_role(uuid, text, uuid, timestamptz)",
      "public.studio2_revoke_access_role(uuid, text, uuid)",
    ]) {
      expect(migration).toContain(`drop function if exists ${signature}`);
    }
  });

  test("removes direct DML from all S16 authorization truth tables", () => {
    for (const table of [
      "public.studio2_capability_grants",
      "public.studio2_role_assignments",
      "public.studio2_role_capabilities",
      "public.studio2_permission_subject_versions",
    ]) {
      expect(migration).toContain(`revoke insert, update, delete on table ${table}`);
    }
    expect(migration).toContain("from public, anon, authenticated, service_role;");
  });

  test("removes the dead persistence wrappers for retired RPCs", () => {
    expect(persistence).not.toContain("studio2_grant_capability");
    expect(persistence).not.toContain("studio2_revoke_capability");
    expect(persistence).not.toContain("Studio2GrantCapabilityRequest");
  });

  test("registers migration adoption and protects the internal engine", () => {
    expect(migration).toContain("20261027213001_v3_s16_authorization_authority");
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("revoke all on function public.studio2_apply_permission_change(");
    expect(migration).toContain("from public, anon, authenticated, service_role;");
  });
});
