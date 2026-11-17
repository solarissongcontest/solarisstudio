import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261117042000_v3_s16_session_revocation_api_dml_retirement.sql",
  "utf8",
);
const negativeSql = readFileSync(
  ".github/tests/v3-s16-session-revocation-api-dml.sql",
  "utf8",
);
const sourceOwner = readFileSync(
  "supabase/migrations/20261016163100_v3_account_session_management_hardening.sql",
  "utf8",
);
const accountRehearsal = readFileSync(
  ".github/scripts/v3-account-session-management-rehearsal.sh",
  "utf8",
);
const s16Rehearsal = readFileSync(
  ".github/scripts/v3-s16-catalog-rehearsal.sh",
  "utf8",
);

describe("S16 scoped account-session tombstone DML retirement", () => {
  it("requires exact non-superuser source owner, RLS, no unreviewed triggers or column grants", () => {
    expect(migration).toContain("current_user <> 'postgres'");
    expect(migration).toContain("current_setting('server_version_num')::integer / 10000 <> 17");
    expect(migration).toContain("v3.s16.session-revocation-api-dml-retirement");
    expect(migration).toContain("and c.relrowsecurity");
    expect(migration).toContain("a.attacl is not null");
    expect(migration).toContain("not t.tgisinternal");
    expect(migration).toContain("not exists");
    expect(migration).toContain("on table public.studio2_account_session_revocations");
    expect(migration).not.toMatch(/alter\s+table\s+.*disable\s+row\s+level\s+security/i);
    expect(migration).not.toMatch(/drop\s+trigger|drop\s+function|alter\s+function/i);
  });

  it("retires only direct session tombstone DML, not Auth ownership or canonical EXECUTE", () => {
    expect(migration).toContain(
      "revoke insert,update,delete,truncate,references,trigger,maintain",
    );
    expect(migration).toContain("from public,anon,authenticated,service_role");
    expect(migration).toContain("has_any_column_privilege");
    expect(migration).toContain("has_table_privilege('service_role',v_table,'SELECT')");
    expect(migration).toContain("has_function_privilege('authenticated',v_fn.oid,'EXECUTE')");
    expect(migration).toContain("has_function_privilege('service_role',v_fn.oid,'EXECUTE')");
    expect(migration).not.toMatch(/\brevoke\s+select\b/i);
    expect(migration).not.toMatch(/\brevoke\s+execute\b/i);
    expect(migration).not.toMatch(/\bgrant\s+(?:insert|update|delete)\b/i);
    expect(migration).not.toContain("delete from auth.sessions;");
  });

  it("checks the existing hardened owner-executed R3 revoke and exact body semantics", () => {
    for (const phrase of [
      "create or replace function public.v3_revoke_session(",
      "security definer",
      "set search_path = pg_catalog, public, private, auth",
      "private.v3_require_active_auth_session()",
      "private.studio2_claim_operation(",
      "insert into public.studio2_account_session_revocations as existing_revocation",
      "delete from auth.sessions session_row",
      "session_row.user_id = v_actor",
      "private.studio2_complete_operation(",
    ]) {
      expect(sourceOwner).toContain(phrase);
      if (phrase !== "create or replace function public.v3_revoke_session(") {
        expect(migration).toContain(
          phrase === "security definer" ? "v_fn.prosecdef" :
            phrase === "set search_path = pg_catalog, public, private, auth" ?
              "search_path=pg_catalog, public, private, auth" :
              phrase,
        );
      }
    }
  });

  it("executes denial as three real API SQL principals without accepting a non-ACL failure", () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      expect(negativeSql).toContain("set local role " + role);
    }
    for (const action of [
      "insert into public.studio2_account_session_revocations default values",
      "update public.studio2_account_session_revocations",
      "delete from public.studio2_account_session_revocations",
      "truncate table public.studio2_account_session_revocations",
    ]) expect(negativeSql).toContain(action);
    expect(negativeSql).toContain("exception when insufficient_privilege");
    expect(negativeSql).toContain("permission denied for table studio2_account_session_revocations");
    expect(negativeSql).toContain("perform count(*) from public.studio2_account_session_revocations");
    expect(s16Rehearsal).toContain(
      "psql \"$DB_URL\" -X -v ON_ERROR_STOP=1 -f .github/tests/v3-s16-session-revocation-api-dml.sql",
    );
  });

  it("retains full positive session revocation + replay and cross-user rejection", () => {
    expect(accountRehearsal).toContain(
      "psql \"$DB_URL\" -X -v ON_ERROR_STOP=1 -f .github/tests/v3-s16-session-revocation-api-dml.sql",
    );
    for (const marker of [
      "expect_success \"revoke viewer A second session\"",
      "expect_success \"exact revoke replay\"",
      "expect_success \"already-revoked reconciliation\"",
      "expect_failure \"cross-user session revoke\"",
      "expect_failure \"current session through non-current revoke\"",
      "Revoked Auth session still exists",
      "Exact retry amplified revocation history",
    ]) expect(accountRehearsal).toContain(marker);
  });
});
