import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scanV3S16StaticAuthority, V3_S16_CRITICAL_DOMAINS } from "./v3-s16-mutation-authority";
import { classifyV3S16ReleaseAuthority } from "./v3-s16-release-risk";

describe("S16 security consequence authority coverage", () => {
  it("requires the actual media finalizer to use the governed worker command instead of raw DML", () => {
    const path = "supabase/functions/solaris-upload-finalize/index.ts";
    const source = readFileSync(path, "utf8");
    const findings = scanV3S16StaticAuthority([{ path, source }]);
    expect(
      findings.some(
        (finding) =>
          finding.domain === "media-upload" && finding.kind === "direct_application_writer",
      ),
    ).toBe(false);
    expect(source).toContain('service.rpc("v3_finalize_media_upload"');
    const migration = readFileSync(
      "supabase/migrations/20261027182223_v3_media_finalization_authority.sql",
      "utf8",
    );
    expect(migration).toContain(
      "revoke insert,update,delete,truncate on public.studio2_upload_authorizations from service_role",
    );
  });

  it("inventories Auth session and tombstone authority without exempting managed writers", () => {
    const session = V3_S16_CRITICAL_DOMAINS.find((domain) => domain.id === "account-session")!;
    expect(session.canonicalTables).toEqual([
      "auth.sessions",
      "public.country_accounts",
      "public.studio2_account_session_revocations",
    ]);
    expect(session.canonicalCommands).toContain("public.v3_revoke_session");
    expect(session.canonicalCommands).toContain("public.v3_claim_country_account");
  });

  it("inspects the canonical permission revision ledger rather than retired duplicate storage", () => {
    const domain = V3_S16_CRITICAL_DOMAINS.find((item) => item.id === "authorization")!;
    expect(domain.canonicalTables).toContain("public.studio2_permission_subject_versions");
    expect(domain.canonicalTables).not.toContain("public.studio2_permission_state_versions");
    const source = readFileSync(
      "supabase/migrations/20261015173000_v3_s3_identity_access_invariants.sql",
      "utf8",
    );
    expect(source).toContain("drop table public.studio2_permission_state_versions");
    expect(source).toContain("Canonical per-user permission revision");
    expect(domain.canonicalCommands).toEqual(["public.studio2_apply_permission_change_r3"]);
  });

  it("keeps Integrity hard until its canonical command inventory is proven", () => {
    const result = classifyV3S16ReleaseAuthority({
      baseFindings: [],
      files: [],
      staticOnly: true,
      domains: V3_S16_CRITICAL_DOMAINS.filter((domain) => ["integrity"].includes(domain.id)).map(
        (domain) => ({
          ...domain,
          canonicalCommands: [],
          sanctionedInternalWriters: [],
          sanctionedWriteTriggers: [],
          sanctionedCrossDomainWriters: [],
          temporaryCompatibilityApplicationWriters: [],
          allowedColumnDmlGrants: [],
          ownerBoundary: "shared" as const,
        }),
      ),
    });
    for (const domain of ["integrity"]) {
      expect(result.findings).toContainEqual(
        expect.objectContaining({
          domain,
          kind: "canonical_command_inventory_missing",
          releaseRisk: "hard_blocker",
        }),
      );
    }
    expect(result.s16Passed).toBe(false);
  });
});
