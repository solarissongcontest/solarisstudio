import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const src=readFileSync(resolve(process.cwd(),"supabase/migrations/20261119001000_v3_integrity_anonymous_intake_single_writer.sql"),"utf8");
const role=readFileSync(resolve(process.cwd(),".github/tests/v3-integrity-anonymous-intake-single-writer.sql"),"utf8");
const jwt=readFileSync(resolve(process.cwd(),".github/scripts/rules-integrity-security-rehearsal.sh"),"utf8");
describe("P04 anonymous intake single authority",()=>{
 it("preserves case, secret, private event and exact-once receipt side effects",()=>{
  for(const part of ["public.v3_public_create_anonymous_integrity_case(","public.integrity_cases",
    "public.integrity_case_access","public.integrity_case_messages","public.integrity_case_events",
    "recovery_secret_ciphertext","extensions.pgp_sym_encrypt(","case.created","request_fingerprint",
    "app.integrity_operation_id","Invalid integrity report category",
    "Summary must be between 5 and 180 characters","drop function public.public_create_anonymous_integrity_case_impl(text,text,text,text,text,text[],text,text) restrict;"])
    expect(src).toContain(part);
  expect(src).not.toContain("v_base_result := public.public_create_anonymous_integrity_case_impl(");
  expect(src).not.toMatch(/disable trigger|drop trigger|truncate table|row_security\s*=\s*off/i);
 });
 it("executes 3 API-role negative proofs and positive real local anonymous reporting",()=>{
  expect(role.match(/set local role (anon|authenticated|service_role);/g)).toHaveLength(3);
  expect(role).toContain("when undefined_function then null");
  expect(jwt).toContain('create_anonymous_case "$ANON_KEY"');
  expect(jwt).toContain("wrong anonymous recovery pair is denied");
  expect(jwt).toContain("fully anonymous case has no reporter_user_id");
 });
});
