import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scanV3S16StaticAuthority, V3_S16_CRITICAL_DOMAINS } from "./v3-s16-mutation-authority";
import { classifyV3S16ReleaseAuthority } from "./v3-s16-release-risk";

describe("S16 security consequence authority coverage", () => {
  it("detects the actual service-role media finalizer as an unresolved canonical writer", () => {
    const path = "supabase/functions/solaris-upload-finalize/index.ts";
    const findings = scanV3S16StaticAuthority([{ path, source: readFileSync(path, "utf8") }]);
    expect(findings).toContainEqual(
      expect.objectContaining({
        domain: "media-upload",
        subject: "public.studio2_upload_authorizations",
        kind: "direct_application_writer",
        releaseRisk: "hard_blocker",
        path,
      }),
    );
  });

  it("inventories Auth session and tombstone authority without exempting managed writers", () => {
    const session = V3_S16_CRITICAL_DOMAINS.find((domain) => domain.id === "account-session")!;
    expect(session.canonicalTables).toEqual([
      "auth.sessions",
      "public.studio2_account_session_revocations",
    ]);
    expect(session.canonicalCommands).toEqual(["public.v3_revoke_session"]);
    expect(session.sanctionedInternalWriters).toBeUndefined();
    expect(session.sanctionedWriteTriggers).toBeUndefined();
  });

  it("keeps media and integrity hard until the canonical command inventory is proven", () => {
    const result = classifyV3S16ReleaseAuthority({
      baseFindings: [],
      files: [],
      staticOnly: true,
      domains: V3_S16_CRITICAL_DOMAINS.filter((domain) =>
        ["media-upload", "integrity"].includes(domain.id),
      ).map((domain) => ({
        ...domain,
        sanctionedInternalWriters: [],
        sanctionedWriteTriggers: [],
        ownerBoundary: "shared" as const,
      })),
    });
    for (const domain of ["media-upload", "integrity"]) {
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
