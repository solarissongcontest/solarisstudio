import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261118180000_v3_integrity_finding_sanction_primitive_consolidation.sql"),
  "utf8",
);

describe("P04 finding and sanction canonical physical writer consolidation", () => {
  it("retains server-owned reviewed CAS, stable operation receipts and fresh authority", () => {
    for (const token of [
      "public.studio2_integrity_record_finding(",
      "public.studio2_integrity_record_sanction(",
      "private.studio2_claim_operation(",
      "private.studio2_complete_operation(",
      "p_expected_version",
      "errcode = 'PT409'",
      "integrity.manage",
      "integrity.sanction",
      "app.integrity_operation_id",
      "app.integrity_rationale",
      "public.integrity_is_organizer()",
    ]) expect(sql).toContain(token);
    expect(sql.match(/private\.studio2_claim_operation\(/g)?.length).toBeGreaterThanOrEqual(2);
    expect(sql.match(/private\.studio2_complete_operation\(/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("retains validated findings, rule relevance, sanctions and reporter-visible events", () => {
    for (const token of [
      "Finding summary must be between 5 and 240 characters",
      "Finding rationale must be between 20 and 12000 characters",
      "Invalid SSC rule id",
      "public.integrity_case_findings",
      "public.integrity_case_rule_links",
      "closed_no_violation",
      "closed_insufficient_evidence",
      "closed_outside_jurisdiction",
      "finding.recorded",
      "Sanction rationale must be between 20 and 12000 characters",
      "Finding does not belong to this case",
      "A sanction requires a confirmed violation finding",
      "public.integrity_sanction_label",
      "public.integrity_case_sanctions",
      "sanction.recorded",
      "public.integrity_case_events",
    ]) expect(sql).toContain(token);
    expect(sql).not.toMatch(/drop trigger|disable trigger|truncate table|row_security\s*=\s*off/i);
  });

  it("actually retires duplicate writer functions, without replacing them", () => {
    expect(sql).toContain("drop function public.admin_record_integrity_finding_impl(uuid,text,text,text,text[],boolean) restrict;");
    expect(sql).toContain("drop function public.admin_record_integrity_sanction_impl(uuid,uuid,integer,integer,text,text,text[],text[],text,boolean) restrict;");
    expect(sql).not.toContain("v_inner := public.admin_record_integrity_finding_impl(");
    expect(sql).not.toContain("v_inner := public.admin_record_integrity_sanction_impl(");
    expect(sql).not.toMatch(/\b(create|replace)\s+function\s+public\.admin_record_integrity_(finding|sanction)_impl/i);
  });
});
