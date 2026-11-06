import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const read=(p:string)=>readFileSync(resolve(process.cwd(),p),"utf8");
describe("TG2 membership effective start protects canonical representation authority",()=>{
 it("checks canonical joined_at while holding the membership row lock",()=>{
  const sql=read("supabase/migrations/20261104121600_v3_tg2_membership_effective_representation.sql");
  expect(sql).toContain("and membership_row.joined_at <= now()");
  expect(sql).toContain("for update;");
  expect(sql).toContain("p_expected_revision is null");
  expect(sql).toContain("private.studio2_claim_operation");
  expect(sql).toContain("private.v3_emit_domain_event");
  expect(sql).toContain("private.studio2_complete_operation");
  expect(sql).toContain("public.studio2_reconcile_operation");
 });
 it("rehearses future denial without changing official membership/history",()=>{
  const sql=read(".github/scripts/v3-tg2-representation-command-rehearsal.sql");
  for(const v of ["TG2_FUTURE_MEMBERSHIP_ASSIGNED_REPRESENTATIVE",
    "TG2_FUTURE_MEMBERSHIP_CHANGED_HISTORY","joined_at = now() + interval '1 day'",
    "joined_at = now() - interval '1 day'","exception when sqlstate '23514'"])
    expect(sql).toContain(v);
  expect(sql).toContain("rollback;");
 });
});
