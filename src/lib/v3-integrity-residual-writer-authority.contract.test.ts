import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261028183000_v3_integrity_residual_writer_authority.sql",
  "utf8",
);
const registry = readFileSync("src/lib/v3-s16-mutation-authority.ts", "utf8");

describe("V3 Integrity residual writer authority", () => {
  it("requires live actor authority for the remaining semantic Integrity writers", () => {
    expect(migration).toContain("private.v3_require_active_auth_session()");
    expect(migration).toContain("private.studio2_user_has_capability(auth.uid(),");
    expect(migration).toContain("revoke all on function %s from public, anon, service_role");
    expect(migration).toContain("search_path = pg_catalog, public, private, auth, storage, extensions");

    for (const command of [
      "public.admin_cancel_integrity_evidence_deletion",
      "public.admin_create_integrity_evidence_disclosure_copy",
      "public.admin_decide_sealed_identity_disclosure",
      "public.admin_discard_expired_evidence_upload",
      "public.admin_finalize_integrity_evidence_deletion",
      "public.admin_finalize_integrity_evidence_derivative",
      "public.admin_integrity_reporter_identity",
      "public.admin_publish_integrity_decision",
      "public.admin_request_sealed_identity_disclosure",
      "public.admin_reveal_sealed_identity",
      "public.admin_schedule_integrity_evidence_deletion",
      "public.admin_upsert_integrity_rule_link",
    ]) {
      expect(registry).toContain(`"${command}"`);
    }
  });

  it("treats stale disclosure expiry as an inaccessible reconciliation primitive", () => {
    expect(registry).toContain('"public.integrity_expire_stale_identity_approvals"');
    expect(migration).toContain(
      "revoke all on function %s from public, anon, authenticated, service_role",
    );
    expect(migration).toContain("search_path = pg_catalog, public, private");
  });

  it("keeps Rules ownership while requiring Integrity scope for case-derived interpretations", () => {
    expect(registry).toContain(
      'functionName: "public.admin_create_rule_interpretation_from_integrity_case"',
    );
    expect(registry).toContain('ownerDomain: "rules"');
    expect(migration).toContain(
      "private.studio2_user_has_capability(auth.uid(), ''rules.edit'', null)",
    );
    expect(migration).toContain(
      "private.studio2_user_has_capability(auth.uid(), ''integrity.manage'', null)",
    );
  });

  it("bumps the S16 policy so prior exact-SHA evidence cannot certify the new boundary", () => {
    expect(registry).toContain('V3_S16_POLICY_VERSION = "v3-s16-mutation-authority-7"');
  });
});
