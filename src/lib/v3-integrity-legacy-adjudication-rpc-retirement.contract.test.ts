import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const file=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");
const migration=file("supabase/migrations/20261117220000_v3_integrity_legacy_adjudication_rpc_retirement.sql");
const sql=file(".github/tests/v3-integrity-legacy-adjudication-rpc-retirement.sql");
const hostile=file(".github/scripts/rules-integrity-security-rehearsal.sh");
const workflow=file(".github/workflows/v3-integrity-authority-restack-local.yml");
describe("P04 legacy Integrity adjudication retirement",()=>{
 it("retires the three old RPCs without deleting owner-only helpers or weakening CAS",()=>{
  for(const name of ["admin_record_integrity_finding","admin_record_integrity_sanction","admin_decide_integrity_appeal"]){
   expect(migration).toContain("drop function public."+name);
   expect(sql).toContain("select public."+name+"(");
   expect(hostile).not.toMatch(new RegExp("rpc_request [^\\n]+ "+name + " "));
  }
  expect(migration).toContain("admin_record_integrity_finding_impl");
  expect(migration).toContain("admin_record_integrity_sanction_impl");
  expect(migration).not.toContain("drop function public.admin_record_integrity_finding_impl");
  expect(migration).toContain("private.studio2_claim_operation");
  expect(migration).toContain("private.studio2_complete_operation");
 });
 it("requires genuine role probes, canonical caller CAS and idempotent replay",()=>{
  expect(sql).toContain("when undefined_function then");
  expect(sql).toContain("set local role %I");
  expect(hostile).toContain("canonical finding retry preserves operation receipt");
  expect(hostile).toContain("stale expected appeal version rejected");
  expect(hostile).toContain("canonical appeal decision retry preserves receipt");
  expect(workflow).toContain("v3-integrity-legacy-adjudication-rpc-retirement.sql");
 });
});
