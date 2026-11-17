import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20261117175500_v3_integrity_intake_direct_primitive_bridge.sql"), "utf8");
const oldBridge = readFileSync(resolve(process.cwd(), "supabase/migrations/20261117162000_v3_integrity_intake_event_provenance.sql"), "utf8");
const compatibility = readFileSync(resolve(process.cwd(), "supabase/migrations/20261117174000_v3_integrity_intake_compatibility_cutover.sql"), "utf8");

function implementation(name: string, tag: string) {
  const start = migration.indexOf(`create or replace function public.${name}(`);
  const end = migration.indexOf(`$${tag}$;`, start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end);
}

describe("P04 Integrity intake: eliminate a real V3 -> legacy -> V3 recursion", () => {
  it("rebinds the protected and anonymous V3 implementations directly to mature internal writers", () => {
    const protectedImpl = implementation("v3_create_protected_integrity_case_impl", "create_protected");
    const anonymousImpl = implementation("v3_public_create_anonymous_integrity_case_impl", "create_anonymous");
    expect(protectedImpl).toContain("public.create_protected_integrity_case_impl(");
    expect(protectedImpl).not.toContain("public.create_protected_integrity_case(");
    expect(anonymousImpl).toContain("public.public_create_anonymous_integrity_case_impl(");
    expect(anonymousImpl).not.toContain("public.public_create_anonymous_integrity_case(");
    // The R2 receipt/semantic idempotency path is not simplified away.
    expect(protectedImpl).toContain("private.studio2_complete_operation(");
    expect(protectedImpl).toContain("p_operation_id");
    expect(anonymousImpl).toContain("idempotency_key_hash");
    expect(anonymousImpl).toContain("recovery_secret_ciphertext");
    expect(anonymousImpl).toContain("p_operation_id");
  });

  it("retains the V3 compatibility entrypoints and provenance but removes only the cyclic implementation edge", () => {
    expect(oldBridge).toContain("rename to v3_create_protected_integrity_case_impl");
    expect(oldBridge).toContain("rename to v3_public_create_anonymous_integrity_case_impl");
    expect(compatibility).toContain("return public.v3_create_protected_integrity_case(");
    expect(compatibility).toContain("return public.v3_public_create_anonymous_integrity_case(");
    expect(migration).toContain("Unexpected Integrity V3/legacy call graph");
    expect(migration).toContain("Unqualified Integrity V3 implementation");
    expect(migration).toContain("Integrity internal primitive remains directly executable");
    expect(migration).toContain("v3_register_migration_contract");
  });

  it("does not edit previously applied creator migrations or add an S16 exception", () => {
    expect(migration).toContain("set local lock_timeout = '5s'");
    expect(migration).toContain("set local statement_timeout = '30s'");
    expect(migration).toContain("pg_get_functiondef");
    expect(migration).toContain("has_function_privilege('service_role'");
    expect(migration).not.toContain("max_stack_depth");
    expect(migration).not.toContain("alter role");
  });
});
