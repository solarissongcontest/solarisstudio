import { execFileSync } from "node:child_process";
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

  it("rebuilds only exact original source-owned claim writers in isolated PG17 recovery", () => {
    const generated = execFileSync(
      "node",
      ["scripts/stage-v3-s16-country-claim-local.mjs"],
      { encoding: "utf8" },
    );
    const original = readFileSync(
      "supabase/migrations/20260916043443_permission_engine_v2_country_ownership_rpc_cutover.sql",
      "utf8",
    );
    expect(generated).toContain(
      "create or replace function public.claim_country_account(_country_id uuid)",
    );
    expect(generated).toContain(
      "create or replace function private.studio2_country_claim_blocked(p_user_id uuid)",
    );
    expect(generated).toContain(
      original.slice(
        original.indexOf("create or replace function public.claim_country_account("),
        original.indexOf("create or replace function public.owns_country("),
      ).trim(),
    );
    expect(generated).toContain("to_regprocedure('public.claim_country_account(uuid)') is not null");
    expect(generated).toContain("md5(p.prosrc)=md5(");
    expect(generated).toContain("current_user <> 'postgres'");
    expect(generated).toContain("already installed or prerequisite drift");
    const authoritative = readFileSync(
      "supabase/migrations/20260918205750_permission_engine_v2_authoritative_cutover.sql",
      "utf8",
    );
    const helperDefinition = authoritative.slice(
      authoritative.indexOf("create or replace function private.studio2_country_claim_blocked("),
      authoritative.indexOf("create or replace function private.studio2_user_access_allowed("),
    ).trim();
    expect(generated).toContain(helperDefinition);
    expect(generated).toContain("20260918205750_permission_engine_v2_authoritative_cutover.sql");
    expect(generated).not.toContain("return public.has_role(p_user_id");
    expect(generated).not.toContain("create or replace function public.has_role(");
    expect(generated).not.toContain("create or replace function public.owns_country(");
    expect(generated).not.toMatch(/grant\s+(insert|update|delete|truncate)\s+on\s+(table\s+)?public\.country_accounts/i);
    expect(generated.trimEnd().endsWith("commit;")).toBe(true);
    const stage = "operator_apply /tmp/s16-country-claim-source.sql";
    const cutover = "operator_apply supabase/migrations/20261116211500_v3_s16_country_account_api_dml_retirement.sql";
    expect(recovery).toContain(
      "node scripts/stage-v3-s16-country-claim-local.mjs > /tmp/s16-country-claim-source.sql",
    );
    expect(recovery.indexOf(stage)).toBeGreaterThan(0);
    expect(recovery.indexOf(stage)).toBeLessThan(recovery.indexOf(cutover));
    expect(recovery).toContain("'/tmp/s16-country-claim-source.sql'");
  });

  it("stages legacy Organizer and HoD commands only from their actual SQL source", () => {
    const generated = execFileSync(
      "node",
      ["scripts/stage-v3-s16-country-admin-hod-local.mjs"],
      { encoding: "utf8" },
    );
    const adminOriginal = readFileSync(
      "supabase/migrations/20260916033414_permission_engine_v2_country_admin_rpc_cutover.sql",
      "utf8",
    );
    const adminBody = adminOriginal.slice(
      adminOriginal.indexOf("create or replace function public.admin_set_country_account_status("),
      adminOriginal.indexOf("create or replace function public.admin_update_country_identity("),
    ).trim();
    const hodOriginal = readFileSync(
      "supabase/migrations/20260821234500_country_hod_self_history.sql",
      "utf8",
    );
    const hodBody = hodOriginal.slice(
      hodOriginal.indexOf("create or replace function public.set_owned_hod_auto_assign("),
      hodOriginal.indexOf("create or replace function public.auto_assign_country_hod_for_participation("),
    ).split("$;")[0] + "$;";
    expect(generated).toContain(adminBody);
    expect(generated).toContain(hodBody.trim());
    expect(generated).toContain("current_user <> 'postgres'");
    expect(generated).toContain("md5(p.prosrc)=md5(");
    expect(generated).toContain("not has_function_privilege('anon'");
    expect(generated).not.toContain("create or replace function public.admin_update_country_identity(");
    expect(generated).not.toContain("create or replace function public.auto_assign_country_hod_for_participation(");
    expect(generated).not.toMatch(/grant\s+(insert|update|delete)\s+on\s+(table\s+)?public\.country_accounts/i);
    expect(generated.trimEnd().endsWith("commit;")).toBe(true);
    const donor = "operator_apply /tmp/s16-country-admin-hod-source.sql";
    const cutover = "operator_apply supabase/migrations/20261116211500_v3_s16_country_account_api_dml_retirement.sql";
    expect(recovery.indexOf(donor)).toBeGreaterThan(0);
    expect(recovery.indexOf(donor)).toBeLessThan(recovery.indexOf(cutover));
    expect(recovery).toContain("'/tmp/s16-country-admin-hod-source.sql'");
  });

  it("proves genuine Auth-owner signup, HoD, claim and both Organizer moderation outcomes", () => {
    expect(execution).toContain("\\if :{?s16_country_positive}");
    // SET LOCAL ROLE in the positive claim MUST execute in the transaction.
    expect(execution).toContain("\\if :{?s16_country_positive}\\nbegin;\\ndo $signup$");
    expect(execution).toContain("set local role authenticated;");
    expect(execution).toContain("public.claim_country_account(");
    expect(execution).toContain("public.set_owned_hod_auto_assign(false)");
    expect(execution).toContain("public.admin_set_country_account_status(");
    expect(execution).toContain("role_key='hod'");
    expect(execution).toContain("authorized Organizer suspension/reactivation");
    expect(execution).toContain("exception when insufficient_privilege");
    expect(execution).not.toContain("insert into auth.users");
    expect(recovery).toContain("-U supabase_auth_admin -d s16_country_authority_probe");
    expect(recovery).toContain("insert into auth.users");
    expect(recovery).toContain("stage-v3-s16-country-admin-hod-local.mjs");
    expect(recovery).toContain("20260914035152_permission_engine_v2_foundation.sql");
    expect(recovery).toContain("studio2_platform_operational_state(singleton,mode,version,reason)");
    expect(recovery).toContain("s16_country_operator_sql -f - < /tmp/s16-country-permission-seed.sql");
    expect(recovery).toContain("role_key,edition_id");
    expect(recovery).toContain("operator_state_digest");
    expect(recovery).toContain("drop database s16_country_authority_probe");
    expect(recovery).toContain("s16_country_operator_sql -v s16_country_positive=1");
    expect(recovery).toContain("operator_apply supabase/migrations/20261116211500_v3_s16_country_account_api_dml_retirement.sql");
    expect(execution).toContain("rollback;");
  });
});
