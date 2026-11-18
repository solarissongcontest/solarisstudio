import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const file = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const sql = file("supabase/migrations/20261118200000_v3_integrity_intake_canonical_command_consolidation.sql");
const installed = file(".github/tests/v3-integrity-intake-direct-primitive-bridge.sql");
const authority = file(".github/tests/v3-integrity-authority-catalog.sql");

describe("P04 V3 participant intake: one reviewed receipt/operation authority", () => {
  it("keeps both existing public RPC identities and their actual role boundary", () => {
    expect(sql).toContain("create or replace function public.v3_public_create_anonymous_integrity_case(");
    expect(sql).toContain("create or replace function public.v3_create_protected_integrity_case(");
    expect(sql).toContain("to anon,authenticated,service_role;");
    expect(sql).toContain("to authenticated,service_role;");
    expect(sql).not.toContain("to anon,authenticated,service_role;\ngrant execute on function public.v3_create_protected_integrity_case");
    expect(sql).toContain("Participant intake public role authority changed");
    expect(sql).toContain("drop function public.v3_public_create_anonymous_integrity_case_impl(");
    expect(sql).toContain("drop function public.v3_create_protected_integrity_case_impl(");
    expect(sql.match(/\) restrict;/g)).toHaveLength(2);
  });

  it("moves real R2 replay and receipts rather than replacing the wrapper with a bypass", () => {
    for (const token of [
      "private.v3_anonymous_integrity_case_operations",
      "private.studio2_request_fingerprint(",
      "private.studio2_complete_operation(",
      "public.studio2_operation_receipts",
      "recovery_secret_ciphertext",
      "extensions.pgp_sym_encrypt(",
      "extensions.pgp_sym_decrypt(",
      "IDEMPOTENCY_CONFLICT",
      "request_fingerprint",
      "v_canonical_operation_id",
      "app.integrity_operation_id",
      "app.integrity_command",
      "replayed",
      "p_operation_id",
    ]) expect(sql).toContain(token);
    expect(sql).toContain("public.public_create_anonymous_integrity_case_impl(");
    expect(sql).toContain("public.create_protected_integrity_case_impl(");
    expect(sql).not.toContain("create or replace function public.public_create_anonymous_integrity_case_impl(");
    expect(sql).not.toContain("create or replace function public.create_protected_integrity_case_impl(");
  });

  it("requires actual role-denied original physical writers and clean/upgrade catalog proof", () => {
    expect(installed).toContain("Retired duplicate intake implementation remains installed");
    expect(installed).toContain("select public.create_protected_integrity_case_impl(");
    expect(installed).toContain("select public.public_create_anonymous_integrity_case_impl(");
    expect(authority).toContain("Duplicate participant intake implementation remains:");
    expect(sql).toContain("set local lock_timeout = '5s'");
    expect(sql).toContain("set local statement_timeout = '30s'");
    expect(sql).toContain("v3_register_migration_contract(");
    expect(sql).toContain("pg_get_functiondef(");
    expect(sql).toContain("RESTRICT fails closed");
    expect(sql).not.toMatch(/drop trigger|disable trigger|row_security\s*=\s*off|alter role|disable row level security/i);
    expect(sql).not.toMatch(/(s16|mutation.authority).*?(waive|allowlist|exception)/i);
  });
});
