import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { governedIntegrityArgs } from "./v3-integrity-governed-operation";

const read = (path: string) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const caseDesk = read("routes/_authenticated/admin/integrity-case.$caseId.tsx");
const resolution = read("routes/_authenticated/admin/integrity-resolution.$caseId.tsx");
const preclearance = read("routes/_authenticated/admin/integrity-preclearance.tsx");
const preclearanceApi = read("lib/integrity-preclearance.ts");
const evidenceApi = read("lib/integrity-evidence.ts");
const appealRead = read("../supabase/migrations/20261117175000_v3_integrity_appeal_version_readback.sql");

describe("P04 Integrity governed writer-network caller cutover", () => {
  it("refuses missing, invalid and stale-unverifiable aggregate revisions", () => {
    const operationId = "11111111-1111-4111-8111-111111111111";
    expect(governedIntegrityArgs(7, operationId)).toEqual({
      p_expected_version: 7,
      p_operation_id: operationId,
      p_idempotency_key: "integrity:" + operationId,
    });
    for (const value of [undefined, null, 0, -1, 1.5, "7", Number.NaN]) {
      expect(() => governedIntegrityArgs(value)).toThrow(/revision is unavailable/);
    }
    expect(() => governedIntegrityArgs(7, "not-a-uuid")).toThrow(/valid Integrity operation/);
    // An uncertain operation can safely reuse the exact identity.
    expect(governedIntegrityArgs(7, operationId)).toEqual(governedIntegrityArgs(7, operationId));
  });

  it("routes the case review, reviewer, communication and finding writes through CAS commands", () => {
    for (const name of [
      "studio2_integrity_case_transition",
      "studio2_integrity_set_case_priority",
      "studio2_integrity_assign_case_reviewer",
      "studio2_integrity_recuse_case_reviewer",
      "studio2_integrity_reply_case",
      "studio2_integrity_add_case_note",
      "studio2_integrity_record_finding",
    ]) expect(caseDesk).toContain('rpc("' + name + '"');
    for (const obsolete of [
      "admin_update_integrity_case_status",
      "admin_set_integrity_priority",
      "admin_assign_integrity_reviewer",
      "admin_recuse_from_integrity_case",
      "admin_reply_integrity_case",
      "admin_add_integrity_case_note",
      "admin_record_integrity_finding",
    ]) expect(caseDesk).not.toContain('rpc("' + obsolete + '"');
    expect(caseDesk).toContain("governedIntegrityArgs(detail.case.version)");
    expect(caseDesk).toContain("governedIntegrityArgs(live.case.version)");
  });

  it("uses canonical sanction and appeal commands rather than legacy mutators", () => {
    for (const name of [
      "studio2_integrity_record_sanction",
      "studio2_integrity_assign_appeal_reviewer",
      "studio2_integrity_resolve_appeal",
    ]) expect(resolution).toContain('rpc("' + name + '"');
    for (const obsolete of [
      "admin_record_integrity_sanction",
      "admin_assign_integrity_appeal_reviewer",
      "admin_decide_integrity_appeal",
    ]) expect(resolution).not.toContain('rpc("' + obsolete + '"');
    expect(resolution).toContain("governedIntegrityArgs(caseVersion)");
    expect(resolution).toContain("governedIntegrityArgs(selected?.version)");
    expect(resolution).toContain("version: number");
  });

  it("uses the observed case version in preclearance and retention, without a direct table writer", () => {
    expect(preclearanceApi).toContain('"studio2_integrity_record_preclearance_ruling"');
    expect(preclearanceApi).not.toContain('"admin_record_integrity_preclearance_ruling"');
    expect(preclearance).toContain("liveDetail.case.version");
    expect(evidenceApi).toContain('"studio2_integrity_set_case_retention"');
    expect(evidenceApi).not.toContain('"admin_set_integrity_case_retention"');
    expect(caseDesk).toContain("retentionReason, detail.case.version");
    for (const source of [caseDesk, resolution, preclearance, preclearanceApi, evidenceApi]) {
      expect(source).not.toMatch(/\.from\(\s*["']integrity_cases["']\s*\)\s*\.(?:insert|update|delete|upsert)/);
    }
  });

  it("preserves appeal read permissions and only extends the canonical read response", () => {
    expect(appealRead).toContain("create or replace function public.admin_integrity_case_resolution(_case_id uuid)");
    expect(appealRead).toContain("'version', a.version");
    expect(appealRead).toContain("public.integrity_is_organizer()");
    expect(appealRead).toContain("'sanctions'");
    expect(appealRead).toContain("'appeals'");
    expect(appealRead).toContain("has_function_privilege('authenticated',fn,'EXECUTE')");
    expect(appealRead).toContain("has_function_privilege('anon',fn,'EXECUTE')");
    expect(appealRead).toContain("acl.grantee=0");
  });
});
