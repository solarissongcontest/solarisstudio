import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";


const migration = readFileSync(
  "supabase/migrations/20261105114255_v3_account_session_rpc_authority.sql",
  "utf8",
);
const rehearsal = readFileSync(
  ".github/scripts/v3-account-session-authority-rehearsal.sh",
  "utf8",
);
const authoritySql = readFileSync(
  ".github/tests/v3-account-session-authority.sql",
  "utf8",
);

describe("V3 account/session canonical authority", () => {
  it("serializes active-session admission with canonical revocation", () => {
    expect(migration).toContain("create or replace function private.v3_require_active_auth_session()");
    expect(migration).toMatch(/v3_require_active_auth_session\(\)[\s\S]*?language plpgsql\s+volatile/i);
    expect(migration).toContain("for key share");
    expect(migration).toContain("alter function private.studio2_require_fresh_auth(integer) volatile");
    expect(migration).toContain("alter function public.v3_my_sessions() volatile");
  });

  it("removes direct API/service-role authority over security account state", () => {
    expect(migration).toContain("revoke all on table public.country_accounts");
    expect(migration).toContain("from public, anon, authenticated, service_role");
    expect(migration).toContain("grant select on table public.country_accounts");
    expect(migration).toContain("create trigger v3_guard_country_account_writer");
    expect(migration).toContain("ACCOUNT_WRITE_AUTHORITY_REQUIRED");
    expect(authoritySql).toContain("service_role raw account UPDATE unexpectedly succeeded");
  });

  it("removes service-role mutation authority over revocation tombstones", () => {
    expect(migration).toContain("revoke all on table public.studio2_account_session_revocations");
    expect(migration).toContain("grant select on table public.studio2_account_session_revocations");
    expect(authoritySql).toContain("service_role raw revocation tombstone INSERT unexpectedly succeeded");
  });

  it("routes every browser-visible country-account writer through governed commands", () => {
    expect(migration).toContain("create or replace function public.v3_claim_country_account(");
    expect(migration).toContain("create or replace function public.v3_set_country_account_status(");
    expect(migration).toContain("create or replace function public.v3_set_owned_hod_auto_assign(");
    expect(migration).toContain("'account.country.claim'");
    expect(migration).toContain("'account.status.change'");
    expect(migration).toContain("'account.hod_auto_assign.change'");
    expect(migration).toContain("p_expected_updated_at timestamptz");
    expect(migration).toContain("message = 'STATE_CHANGED'");

    const legacyClaim = migration.slice(migration.indexOf("create or replace function public.claim_country_account(_country_id uuid)"));
    expect(legacyClaim).toContain("public.v3_claim_country_account(");
    const legacyStatus = migration.slice(migration.indexOf("create or replace function public.admin_set_country_account_status("));
    expect(legacyStatus).toContain("public.v3_set_country_account_status(");
    const legacyAuto = migration.slice(migration.indexOf("create or replace function public.set_owned_hod_auto_assign(_enabled boolean)"));
    expect(legacyAuto).toContain("public.v3_set_owned_hod_auto_assign(");
  });

  it("runs production-frontier account mutations before the read-only recovery gate", () => {
    const workflow = readFileSync(".github/workflows/v3-account-session-management-rehearsal.yml", "utf8");
    const hosted = workflow.split("  upgrade-from-production-head:")[1];
    expect(hosted).toBeDefined();
    const authority = hosted!.indexOf("Rehearse canonical authority after production-frontier upgrade");
    const recovery = hosted!.indexOf("Rehearse password recovery in read-only after hosted production-head upgrade");
    expect(authority).toBeGreaterThan(-1);
    expect(recovery).toBeGreaterThan(authority);
    expect(readFileSync(".github/scripts/v3-password-recovery-readonly-rehearsal.sh", "utf8"))
      .toContain('password recovery rehearsal did not finish in read_only');
  });

  it("proves refresh rotation, stale credentials and the revoke race at the real local boundaries", () => {
    expect(rehearsal).toContain("grant_type=refresh_token");
    expect(rehearsal).toContain('[[ "$ROTATED_SESSION" == "$TARGET_SESSION" ]]');
    expect(rehearsal).toContain("refresh-token chain survived session revocation");
    expect(rehearsal).toContain("revoked rotated access credential");
    expect(rehearsal).toContain("revoked rotated refresh credential");
    expect(rehearsal).toContain("select private.v3_require_active_auth_session();");
    expect(rehearsal).toContain("revocation did not wait for active-session transaction lock");
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
  });
});
