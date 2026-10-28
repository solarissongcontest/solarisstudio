import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261023214000_v3_integrity_participant_idempotency_current_main.sql",
  ),
  "utf8",
);

describe("V3 participant Integrity retry authority", () => {
  it("registers an S13 forward-fix contract and avoids a second case write model", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("'v3.integrity.participant-case-idempotency'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).not.toContain("insert into public.integrity_cases");
    expect(migration).not.toContain("insert into public.integrity_case_messages");
    expect(migration).not.toContain("insert into public.integrity_case_events");
    expect(migration).not.toMatch(/drop\s+table/i);
    expect(migration).not.toMatch(/truncate/i);
  });

  it("keeps anonymous retry identity private and recovery material encrypted", () => {
    const tableStart = migration.indexOf(
      "create table if not exists private.v3_anonymous_integrity_case_operations",
    );
    const functionStart = migration.indexOf(
      "create or replace function public.v3_public_create_anonymous_integrity_case",
    );
    const tableContract = migration.slice(tableStart, functionStart);

    expect(tableStart).toBeGreaterThanOrEqual(0);
    expect(tableContract).toContain("idempotency_key_hash text primary key");
    expect(tableContract).not.toContain("idempotency_key text");
    expect(tableContract).toContain("recovery_secret_ciphertext bytea");
    expect(tableContract).not.toContain("recovery_key text");
    expect(migration).toContain(
      "extensions.digest(convert_to(v_key, 'UTF8'), 'sha256')",
    );
    expect(migration).toContain("extensions.pgp_sym_encrypt(");
    expect(migration).toContain("extensions.pgp_sym_decrypt(");
  });

  it("serializes an anonymous submission before invoking the mature writer", () => {
    const insert = migration.indexOf(
      "insert into private.v3_anonymous_integrity_case_operations",
    );
    const conflict = migration.indexOf("on conflict do nothing;", insert);
    const lock = migration.indexOf("for update;", conflict);
    const legacyWriter = migration.indexOf(
      "v_base_result := public.public_create_anonymous_integrity_case(",
      lock,
    );

    expect(insert).toBeGreaterThanOrEqual(0);
    expect(conflict).toBeGreaterThan(insert);
    expect(lock).toBeGreaterThan(conflict);
    expect(legacyWriter).toBeGreaterThan(lock);
    expect(migration).toContain(
      "v_operation.request_fingerprint is distinct from v_fingerprint",
    );
    expect(migration).toContain("'replayed', true");
    expect(migration).toContain("'replayed', false");
  });

  it("stores no plaintext anonymous recovery key in the replay result", () => {
    expect(migration).toContain("v_result := (v_base_result - 'recovery_key')");
    expect(migration).toContain("recovery_secret_ciphertext = extensions.pgp_sym_encrypt(");
    expect(migration).toContain("'recovery_key', v_recovery_secret");
  });

  it("binds protected retries to the authenticated actor and canonical receipt", () => {
    const protectedStart = migration.indexOf(
      "create or replace function public.v3_create_protected_integrity_case",
    );
    const protectedCaseSql = migration.slice(protectedStart);

    expect(protectedStart).toBeGreaterThanOrEqual(0);
    expect(protectedCaseSql).toContain("v_actor uuid := auth.uid()");
    expect(protectedCaseSql).toContain("insert into public.studio2_operation_receipts");
    expect(protectedCaseSql).toContain("'integrity.case.create.protected'");
    expect(protectedCaseSql).toContain("receipt.actor_id = v_actor");
    expect(protectedCaseSql).toContain("for update;");
    expect(protectedCaseSql).toContain(
      "v_receipt.request_fingerprint is distinct from v_fingerprint",
    );
    expect(protectedCaseSql).toContain(
      "perform private.studio2_complete_operation(v_canonical_operation_id, v_result)",
    );
    expect(protectedCaseSql).toContain("'receipt_id', v_canonical_operation_id");
  });

  it("wraps existing validated case writers rather than duplicating their rules", () => {
    expect(migration).toContain(
      "v_base_result := public.public_create_anonymous_integrity_case(",
    );
    expect(migration).toContain(
      "v_base_result := public.create_protected_integrity_case(",
    );
    expect(migration).toContain("integrity_case.reporter_user_id = v_actor");
  });

  it("exposes only the intended V3 intake RPCs", () => {
    expect(migration).toContain(
      "grant execute on function public.v3_public_create_anonymous_integrity_case(",
    );
    expect(migration).toContain("to anon, authenticated, service_role");
    expect(migration).toContain(
      "grant execute on function public.v3_create_protected_integrity_case(",
    );
    expect(migration).toContain("to authenticated, service_role");
  });
});
