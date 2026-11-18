import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(),
  "supabase/migrations/20261118181000_v3_integrity_reporter_reply_primitive_consolidation.sql"), "utf8");
const roleTests = readFileSync(resolve(process.cwd(),
  ".github/tests/v3-integrity-reporter-primitive-consolidation.sql"), "utf8");

describe("P04 reporter reply physical writer consolidation", () => {
  it("preserves the two V3 canonical ingress commands and receipt/CAS semantics", () => {
    for (const marker of [
      "function public.v3_reporter_reply_integrity_case",
      "function public.v3_public_reply_anonymous_integrity_case",
      "integrity.case.reporter_reply.anonymous",
      "integrity.case.reporter_reply",
      "studio2_operation_receipts",
      "v_case.version <> p_expected_version",
      "using errcode = 'PT409'",
      "request_fingerprint",
      "recovery_secret_hash",
      "Anonymous replay has no JWT actor",
      "v_case.reporter_user_id is distinct from v_actor",
      "private.studio2_complete_operation",
      "v_row.completed_at is not null",
    ]) expect(sql).toContain(marker);
    const proof = sql.indexOf("Anonymous replay has no JWT actor");
    const replay = sql.indexOf("if v_row.completed_at is not null then");
    expect(proof).toBeGreaterThan(0);
    expect(replay).toBeGreaterThan(proof);
  });
  it("moves both physical effects into CAS-owned commands preserving reporter privacy and audit history", () => {
    for (const marker of [
      "Message must be between 2 and 8000 characters",
      "insert into public.integrity_case_messages",
      "update public.integrity_case_requests",
      "update public.integrity_cases",
      "insert into public.integrity_case_events",
      "reporter.message",
      "Additional information received",
      "Reporter response received",
      "public.integrity_case_snapshot",
      "where case_id = v_case_id",
      "where case_id = p_case_id",
    ]) expect(sql).toContain(marker);
  });
  it("RESTRICT-drops duplicate writers and rejects direct API-role calls", () => {
    expect(sql).toContain("drop function public.reporter_reply_integrity_case_impl(uuid,text) restrict;");
    expect(sql).toContain("drop function public.public_reply_anonymous_integrity_case_impl(text,text,text) restrict;");
    expect(sql).not.toContain("v_result := public.reporter_reply_integrity_case_impl(");
    expect(sql).not.toContain("v_inner := public.public_reply_anonymous_integrity_case_impl(");
    expect(sql.match(/\bcommit;/g)?.length).toBe(1);
    expect(roleTests).toContain("set local role anon;");
    expect(roleTests).toContain("set local role authenticated;");
    expect(roleTests).toContain("set local role service_role;");
    expect(roleTests).toContain("when undefined_function then null");
  });
});
