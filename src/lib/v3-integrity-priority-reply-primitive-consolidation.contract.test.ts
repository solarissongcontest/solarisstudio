import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(),
  "supabase/migrations/20261118172000_v3_integrity_priority_reply_primitive_consolidation.sql"), "utf8");

describe("P04 priority/reply physical writer consolidation", () => {
  it("keeps the caller-owned operation and conflict contract", () => {
    for (const token of ["private.studio2_claim_operation", "private.studio2_complete_operation",
      "errcode = 'PT409'", "p_expected_version", "app.integrity_operation_id"])
      expect(source).toContain(token);
    expect(source).not.toContain("disable trigger");
    expect(source).not.toContain("drop table");
  });

  it("retains validated message, request, priority and event writes under one command", () => {
    for (const token of ["update public.integrity_cases", "insert into public.integrity_case_events",
      "insert into public.integrity_case_messages", "insert into public.integrity_case_requests",
      "drop function public.admin_set_integrity_priority_impl(uuid,text) restrict;",
      "drop function public.admin_reply_integrity_case_impl(uuid,text,boolean) restrict;"])
      expect(source).toContain(token);
    expect(source).not.toMatch(/perform public\.admin_(?:set_integrity_priority|reply_integrity_case)_impl\(/);
  });
});
