import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20261118175000_v3_integrity_preclearance_primitive_consolidation.sql"),"utf8");

describe("P04 preclearance case authority ownership", () => {
  it("preserves R3 CAS, review scope and receipt", () => {
    for (const t of ["private.studio2_claim_operation","private.studio2_complete_operation",
      "p_expected_version","errcode = 'PT409'","integrity.manage","app.integrity_operation_id",
      "'rule_question'"]) expect(sql).toContain(t);
    expect(sql).not.toMatch(/drop trigger|disable trigger|truncate table|row_security\s*=\s*off/i);
  });
  it("keeps validated rulings, reviewer-visibility and canonical event history", () => {
    for (const t of ["integrity_validate_rule_ids", "integrity_preclearance_rulings",
      "integrity_case_events", "needs_more_information", "waiting_for_reporter", 
      "Pre-clearance rationale must be between 20 and 12000 characters",
      "drop function public.admin_record_integrity_preclearance_ruling_impl(uuid,text,text,text,text[]) restrict;"])
       expect(sql).toContain(t);
    expect(sql).not.toMatch(/v_inner := public\.admin_record_integrity_preclearance_ruling_impl\(/);
  });
});
