import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261116211500_v3_s16_country_account_api_dml_retirement.sql",
  "utf8",
);
const execution = readFileSync(
  ".github/tests/v3-s16-country-account-api-dml.sql",
  "utf8",
);
const recovery = readFileSync(
  ".github/scripts/v3-observed-owner-recovery-local.sh",
  "utf8",
);

describe("S16 country account API-role DML retirement", () => {
  it("retires direct mutation with a forward-only exact owner preflight", () => {
    expect(migration).toContain("current_user <> 'postgres'");
    expect(migration).toContain("v3.s16.country-account-api-dml-retirement");
    expect(migration).toContain("v_guard oid := to_regprocedure('private.studio2_guard_direct_client_write()')");
    expect(migration).toContain("t.tgtype=30");
    expect(migration).toContain("t.tgenabled='O'");
    expect(migration).toContain("and c.relrowsecurity");
    expect(migration).toContain("revoke insert,update,delete,truncate,references,trigger,maintain on table");
    expect(migration).toContain("from public,anon,authenticated,service_role");
    expect(migration).toContain("has_any_column_privilege");
    expect(migration).not.toMatch(/drop trigger|disable row level security|alter function/i);
  });

  it("requires the four observed owner writers, preserving their actual source path", () => {
    for (const name of [
      "public.claim_country_account(uuid)",
      "public.admin_set_country_account_status(uuid,text,text)",
      "public.claim_country_from_signup()",
      "public.set_owned_hod_auto_assign(boolean)",
    ]) expect(migration).toContain(name);
    for (const path of ["public, private", "public, auth", "public, pg_temp"])
      expect(migration).toContain(path);
    expect(migration).toContain("v_fn.prosecdef");
    expect(migration).toContain("pg_get_userbyid(v_fn.proowner)<>'postgres'");
    expect(migration).toContain("on_solaris_country_signup");
    expect(migration).toContain("touch_country_accounts_updated_at");
    expect(migration).toContain("ensure_country_account_hod_role");
  });

  it("proves actual SQL denial as three caller roles even with forged recovery flags", () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      expect(execution).toContain("set local role " + role);
    }
    for (const action of ["insert into", "update public", "delete from", "truncate public"])
      expect(execution).toContain(action);
    for (const marker of ["studio2.platform_recovery_write", "studio2.confirmation_maintenance_write"])
      expect(execution).toContain(marker);
    expect(execution).toContain("exception when insufficient_privilege");
  });

  it("executes genuine signup, ownership, HoD and negative moderation command probes", () => {
    for (const path of [
      "insert into auth.users",
      "public.claim_country_account(",
      "public.set_owned_hod_auto_assign(false)",
      "public.admin_set_country_account_status(",
    ]) expect(execution).toContain(path);
    expect(execution).toContain("rollback;");
    expect(recovery).toContain("operator_apply supabase/migrations/20261116211500_v3_s16_country_account_api_dml_retirement.sql");
    expect(recovery).toContain("operator_sql -f - < .github/tests/v3-s16-country-account-api-dml.sql");
  });
});
