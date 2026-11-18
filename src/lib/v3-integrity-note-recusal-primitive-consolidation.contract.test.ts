import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(),
  "supabase/migrations/20261118173000_v3_integrity_note_recusal_primitive_consolidation.sql"), "utf8");

describe("P04 note and recusal single-writer CAS ownership", () => {
  it("retains caller-owned operation, expected revision and audit receipt", () => {
    for (const signal of ["private.studio2_claim_operation", "private.studio2_complete_operation",
      "p_expected_version", "errcode = 'PT409'", "app.integrity_operation_id"])
      expect(migration).toContain(signal);
    expect(migration).not.toMatch(/disable trigger|drop trigger|truncate table|set row_security = off/i);
  });

  it("retains investigator note, self-recusal and audit event effects", () => {
    for (const token of [
      "public.integrity_case_reviewers", "recused_at = now()", "user_id = auth.uid()",
      "public.integrity_case_internal_notes", "public.integrity_case_events",
      "public.integrity_cases", "visible_to_reporter", "private.studio2_complete_operation",
      "drop function public.admin_recuse_from_integrity_case_impl(uuid,text) restrict;",
      "drop function public.admin_add_integrity_case_note_impl(uuid,text) restrict;",
    ]) expect(migration).toContain(token);
    expect(migration).not.toMatch(/v_inner := public\.admin_(?:add_integrity_case_note|recuse_from_integrity_case)_impl/);
  });
});
