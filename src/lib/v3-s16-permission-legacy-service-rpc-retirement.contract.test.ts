import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261117230000_v3_s16_permission_legacy_service_rpc_retirement.sql", "utf8");
const actualRoles = readFileSync(".github/tests/v3-s16-permission-legacy-service-rpc-retirement.sql", "utf8");
const persistence = readFileSync("src/lib/studio2-persistence.ts", "utf8");
const r3Migration = readFileSync("supabase/migrations/20261003151000_organisation_os_v5_r3_permission_approvals.sql", "utf8");

describe("S16 P16 complete legacy Permission Engine writer retirement", () => {
  const old = [
    "studio2_grant_capability(uuid,text,uuid,timestamptz)",
    "studio2_revoke_capability(uuid,text,uuid)",
    "studio2_assign_access_role(uuid,text,uuid,timestamptz)",
    "studio2_revoke_access_role(uuid,text,uuid)",
  ];

  it("physically drops all four exact privileged API mutation signatures, without cascade", () => {
    for (const signature of old) {
      expect(migration).toContain("drop function public." + signature + " restrict;");
      expect(actualRoles).toContain("public." + signature);
    }
    expect(migration).not.toMatch(/drop function[^;]+cascade/i);
    expect(migration).toContain("pg_get_userbyid(p.proowner)='postgres'");
    expect(migration).toContain("private.studio2_request_is_service_role()");
    expect(migration).toContain("p.oid <> all(v_targets)");
    expect(migration).toContain("set local lock_timeout = '5s'");
    expect(migration).toContain("set local statement_timeout = '30s'");
  });

  it("keeps R3 actual owner, fresh authorization, second approval, CAS and receipts", () => {
    expect(migration).toContain("studio2_apply_permission_change_r3(uuid,text,text,uuid,timestamptz,uuid,text,bigint,uuid)");
    expect(migration).toContain("studio2_request_permission_change_approval");
    expect(migration).toContain("studio2_approve_permission_change");
    expect(r3Migration).toContain("An approved second-operator request is required");
    expect(r3Migration).toContain("p_expected_version");
    expect(r3Migration).toContain("p_approval_request_id");
    expect(r3Migration).toContain("v_existing.result");
  });

  it("has actual negative SQL calls as all PostgREST roles, not only ACL inspection", () => {
    for (const role of ["anon", "authenticated", "service_role"]) expect(actualRoles).toContain("'" + role + "'");
    for (const name of ["studio2_grant_capability", "studio2_revoke_capability", "studio2_assign_access_role", "studio2_revoke_access_role"]) {
      expect(actualRoles).toContain("select public." + name + "(");
    }
    expect(actualRoles).toContain("exception when undefined_function");
    expect(actualRoles).toContain("set local role");
  });

  it("removes unreachable client callers to old service mutators instead of hiding UI", () => {
    expect(persistence).not.toContain("client.rpc('studio2_grant_capability'");
    expect(persistence).not.toContain("client.rpc('studio2_revoke_capability'");
    expect(persistence).toContain("Use the reviewed Permission Engine R3 approval workflow");
    expect(persistence).toContain("async grantCapability(");
    expect(persistence).toContain("async revokeCapability(");
  });
});
