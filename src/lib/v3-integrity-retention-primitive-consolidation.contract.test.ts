import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20261118174000_v3_integrity_retention_primitive_consolidation.sql"), "utf8");
describe("P04 evidence-retention single-owner consolidation", () => {
  it("preserves version, operation, security and receipt boundary", () => {
    for (const token of ["studio2_integrity_set_case_retention", "private.studio2_claim_operation", "private.studio2_complete_operation", "p_expected_version", "errcode = 'PT409'"]) expect(sql).toContain(token);
    expect(sql).not.toMatch(/disable trigger|drop trigger|truncate table|row_security\s*=\s*off/i);
  });
  it("preserves active evidence, retention audit events and old business validation", () => {
    for (const token of ["retention_until = p_retention_until", "lifecycle_status = 'active'", "Retention date must be in the future", "public.integrity_case_evidence", "public.integrity_case_events", "retention.updated", "drop function public.admin_set_integrity_case_retention_impl(uuid,timestamptz,text) restrict;"]) expect(sql).toContain(token);
    expect(sql).not.toMatch(/v_inner := public\.admin_set_integrity_case_retention_impl\(/);
  });
});
