import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const migration = readFileSync(resolve(process.cwd(),"supabase/migrations/20261119000000_v3_integrity_participant_appeal_primitive_consolidation.sql"),"utf8");
const sql = readFileSync(resolve(process.cwd(),".github/tests/v3-integrity-participant-appeal-primitive-consolidation.sql"),"utf8");
const jwt = readFileSync(resolve(process.cwd(),".github/scripts/rules-integrity-security-rehearsal.sh"),"utf8");
describe("P04 participant appeal primitive consolidation", () => {
  it("preserves canonical grants, physical effects, receipts and sanction eligibility", () => {
    for(const token of ["public.v3_submit_integrity_appeal(","public.v3_public_submit_anonymous_integrity_appeal(",
      "public.integrity_case_appeals","public.integrity_case_events","private.studio2_complete_operation(",
      "request_fingerprint","app.integrity_operation_id","48 hours","rejected_late",
      "Appealable sanction not found","An appeal has already been submitted for this sanction"])expect(migration).toContain(token);
    expect(migration).not.toMatch(/disable trigger|drop trigger|truncate table|row_security\s*=\s*off/i);
    expect(migration).toContain("drop function public.reporter_submit_integrity_appeal_impl(uuid,uuid,text) restrict;");
    expect(migration).toContain("drop function public.public_submit_anonymous_integrity_appeal_impl(text,text,uuid,text) restrict;");
    expect(migration).not.toContain("v_result := public.reporter_submit_integrity_appeal_impl(");
    expect(migration).not.toContain("v_result := public.public_submit_anonymous_integrity_appeal_impl(");
  });
  it("requires anonymous recovery credentials before a completed receipt replay", () => {
    const secret=migration.indexOf("a.recovery_secret_hash = v_hash");
    const replay=migration.indexOf("if v_row.completed_at is not null then\n    return coalesce");
    expect(secret).toBeGreaterThan(0);
    expect(replay).toBeGreaterThan(secret);
    expect(migration).toContain("for update of c");
  });
  it("executes all three role-negative probes and JWT positive/replay/isolation",()=>{
    expect(sql.match(/set local role (anon|authenticated|service_role);/g)).toHaveLength(3);
    expect(sql).toContain("when undefined_function then null");
    expect(jwt).toContain('v3_submit_integrity_appeal "$APPEAL_SUBMIT_PAYLOAD"');
    expect(jwt).toContain("governed participant appeal safely replays");
    expect(jwt).toContain("cross-reporter participant receipt replay is rejected");
  });
});
