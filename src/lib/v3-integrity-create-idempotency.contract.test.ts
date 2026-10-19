import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261019210500_v3_integrity_create_idempotency.sql",
  ),
  "utf8",
);

function occurrences(source: string, pattern: RegExp) {
  return [...source.matchAll(pattern)].length;
}

describe("V3 Integrity creation idempotency", () => {
  it("routes both compatibility surfaces through one canonical physical case writer", () => {
    expect(migration).toContain("private.v3_insert_integrity_case(");
    expect(occurrences(migration, /insert into public\.integrity_cases\s*\(/gi)).toBe(1);
    expect(occurrences(migration, /insert into public\.integrity_case_messages\s*\(/gi)).toBe(1);
    expect(occurrences(migration, /insert into public\.integrity_case_events\s*\(/gi)).toBe(1);

    expect(migration).toContain("public.v3_create_anonymous_integrity_case(");
    expect(migration).toContain("public.v3_create_protected_integrity_case(");
    expect(migration).toMatch(
      /public_create_anonymous_integrity_case[\s\S]*public\.v3_create_anonymous_integrity_case\(/,
    );
    expect(migration).toMatch(
      /create_protected_integrity_case[\s\S]*public\.v3_create_protected_integrity_case\(/,
    );
  });

  it("keeps anonymous retry identity private and never persists plaintext capabilities", () => {
    expect(migration).toContain("private.v3_anonymous_integrity_create_operations");
    expect(migration).toContain("idempotency_hash text not null unique");
    expect(migration).toContain("recovery_secret_hash text not null");
    expect(migration).toContain("request_fingerprint text not null");
    expect(migration).not.toContain("  idempotency_key text not null");
    expect(migration).not.toContain("  recovery_key text not null");
    expect(migration).toContain("extensions.digest(convert_to(v_recovery_raw, 'UTF8'), 'sha256')");
    expect(migration).toContain("p_operation_id::text || ':' || v_key");
    expect(migration).toContain("revoke all on table private.v3_anonymous_integrity_create_operations");
  });

  it("serializes anonymous duplicate clicks and rejects semantic key reuse", () => {
    expect(migration).toContain("pg_catalog.pg_advisory_xact_lock(");
    expect(migration).toContain("'v3-integrity-anon-op:' || p_operation_id::text");
    expect(migration).toContain("'v3-integrity-anon-key:' || v_idempotency_hash");
    expect(migration).toContain("operation_row.idempotency_hash = v_idempotency_hash");
    expect(migration).toContain("v_existing.request_fingerprint is distinct from v_fingerprint");
    expect(migration).toContain("message = 'IDEMPOTENCY_CONFLICT'");
  });

  it("replays a committed anonymous result before checking whether new writes are allowed", () => {
    const replay = migration.indexOf("if v_existing.operation_id is not null then");
    const platformGate = migration.indexOf(
      "private.studio2_platform_mutation_allowed('integrity.case.create')",
    );

    expect(replay).toBeGreaterThan(-1);
    expect(platformGate).toBeGreaterThan(replay);
    expect(migration).toContain("v_existing.response_snapshot");
    expect(migration).toContain("'recovery_key', v_recovery_pretty");
    expect(migration).toContain("'replayed', true");
  });

  it("provides anonymous lost-response reconciliation without creating a case-probing API", () => {
    expect(migration).toContain("public.v3_reconcile_anonymous_integrity_case(");
    expect(migration).toContain("operation_row.operation_id = p_operation_id");
    expect(migration).toContain("operation_row.idempotency_hash = v_idempotency_hash");
    expect(migration).toContain("operation_row.recovery_secret_hash = v_recovery_hash");
    expect(migration).toContain("errcode = 'P0002', message = 'UNKNOWN'");
    expect(migration).not.toMatch(/select[\s\S]*from public\.integrity_cases[\s\S]*where[\s\S]*public_code\s*=\s*p_/i);
  });

  it("uses the canonical actor-bound S2 receipt for protected reports", () => {
    expect(migration).toContain("v_actor uuid := auth.uid()");
    expect(migration).toContain("private.studio2_claim_operation(");
    expect(migration).toContain("'integrity.case.create'");
    expect(migration).toContain("'R1'");
    expect(migration).toContain("private.studio2_complete_operation(v_canonical_operation_id, v_result)");
    expect(migration).toContain("'receiptId', v_canonical_operation_id");
    expect(migration).toContain("coalesce(v_claim -> 'result', '{}'::jsonb)");
  });

  it("preserves identity privacy at the canonical writer", () => {
    expect(migration).toContain("v_identity_mode = 'anonymous' and p_reporter_user_id is not null");
    expect(migration).toContain("v_identity_mode <> 'anonymous' and p_reporter_user_id is null");
    expect(migration).toContain("p_recovery_secret_hash is null");
    expect(migration).toContain("'anonymous',\n    null,");
    expect(migration).toContain("v_identity_mode,\n    v_actor,");
  });

  it("keeps direct tables closed and exposes only the intended RPC surfaces", () => {
    expect(migration).toContain(
      "grant execute on function public.v3_create_anonymous_integrity_case(",
    );
    expect(migration).toContain("to anon, authenticated");
    expect(migration).toContain(
      "grant execute on function public.v3_create_protected_integrity_case(",
    );
    expect(migration).toContain("to authenticated");
    expect(migration).toContain("revoke all on function private.v3_insert_integrity_case(");
  });

  it("is governed by the S13 forward-fix migration contract", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("20261019210500_v3_integrity_create_idempotency");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain("false,");
  });
});
