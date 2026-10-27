import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { classifyV3ConsequenceRelease } from "./v3-consequence-release-classification";
import { classifyV3ReleaseFinding } from "./v3-release-risk";
import { V3_S16_CRITICAL_DOMAINS } from "./v3-s16-mutation-authority";

const migration = readFileSync(
  "supabase/migrations/20261027184517_v3_account_session_canonical_authority.sql",
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

  it("makes S16 inspect the actual account/session security stores and writers", () => {
    const domain = V3_S16_CRITICAL_DOMAINS.find((entry) => entry.id === "account-session");
    expect(domain).toBeDefined();
    expect(domain?.canonicalTables).toEqual([
      "auth.sessions",
      "public.country_accounts",
      "public.studio2_account_session_revocations",
    ]);
    expect(domain?.canonicalCommands).toEqual(expect.arrayContaining([
      "public.v3_claim_country_account",
      "public.v3_set_country_account_status",
      "public.v3_set_owned_hod_auto_assign",
      "public.v3_revoke_session",
    ]));
    expect(domain?.sanctionedInternalWriters).toContain("public.claim_country_from_signup");
    expect(domain?.sanctionedWriteTriggers).toContain("v3_guard_country_account_writer");
  });

  it("keeps account/session security synchronous while demoting only the exact derived events", () => {
    for (const event of ["account.changed", "session.changed", "session.revoked"]) {
      expect(classifyV3ConsequenceRelease(event)).toBe("derived");
      expect(classifyV3ReleaseFinding(`DOMAIN_CONSEQUENCE_DECLARED ${event}`)).toEqual(
        expect.objectContaining({
          releaseRisk: "tracked_migration_debt",
          consequenceClass: "derived",
          rule: "derived_consequence_debt",
        }),
      );
    }

    expect(classifyV3ConsequenceRelease("account.security_compromised")).toBe("integrity_critical");
    expect(classifyV3ConsequenceRelease("session.security_compromised")).toBe("integrity_critical");
    expect(classifyV3ConsequenceRelease("permissions.changed")).toBe("integrity_critical");
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
