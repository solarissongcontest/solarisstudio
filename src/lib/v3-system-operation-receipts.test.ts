import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261014194651_v3_s2_operation_receipt_idempotency.sql"),
  "utf8",
);

describe("System V3 S2 operation receipts", () => {
  it("evolves the existing receipt instead of creating a parallel ledger", () => {
    expect(migration).toContain("alter table public.studio2_operation_receipts");
    expect(migration).not.toContain("create table public.studio2_operation_receipts");
    expect(migration).toContain("add column if not exists correlation_id uuid");
    expect(migration).toContain("add column if not exists request_fingerprint text");
    expect(migration).toContain("add column if not exists completed_at timestamptz");
  });

  it("fingerprints normalized jsonb semantic requests with sha256", () => {
    expect(migration).toContain("private.studio2_request_fingerprint");
    expect(migration).toContain("p_semantic_request jsonb");
    expect(migration).toContain("extensions.digest(");
    expect(migration).toContain("'sha256'");
    expect(migration).toContain("request_fingerprint is distinct from v_fingerprint");
    expect(migration).toContain("message = 'IDEMPOTENCY_CONFLICT'");
  });

  it("keeps legacy claims compatible while exposing the canonical overload", () => {
    expect(migration).toContain("uuid, text, uuid, text, text, jsonb, jsonb");
    expect(migration).toContain("private.studio2_claim_operation(uuid, text, text, text, jsonb)");
    expect(migration).toContain("p_operation_id,\n    p_idempotency_key,\n    p_operation_id,");
  });

  it("supports successful, failed, and uncertain terminal receipts", () => {
    expect(migration).toContain("status in ('processing', 'succeeded', 'failed', 'uncertain')");
    expect(migration).toContain("private.studio2_complete_operation");
    expect(migration).toContain("private.studio2_fail_operation");
    expect(migration).toContain("private.studio2_mark_operation_uncertain");
    expect(migration).toContain("studio2_operation_receipts_completion_check");
  });

  it("keeps safe failures bounded to the canonical taxonomy", () => {
    for (const code of [
      "AUTHENTICATION",
      "AUTHORIZATION",
      "VALIDATION",
      "STATE_CHANGED",
      "VERSION_CONFLICT",
      "IDEMPOTENCY_CONFLICT",
      "RATE_LIMIT",
      "DEPENDENCY_FAILURE",
      "DATABASE",
      "STORAGE",
      "TIMEOUT",
      "UNKNOWN",
    ]) {
      expect(migration).toContain(`'${code}'`);
    }
    expect(migration).toContain("pg_column_size(error_metadata) <= 8192");
  });

  it("exposes only actor-scoped reconciliation to authenticated callers", () => {
    expect(migration).toContain("public.studio2_reconcile_operation(\n  p_operation_id uuid");
    expect(migration).toContain("receipt.actor_id = v_actor");
    expect(migration).toContain(
      "revoke all on function public.studio2_reconcile_operation(uuid)\n  from public, anon",
    );
    expect(migration).toContain(
      "grant execute on function public.studio2_reconcile_operation(uuid)\n  to authenticated, service_role",
    );
  });

  it("does not trust a caller-supplied actor", () => {
    expect(migration).toContain("v_actor uuid := auth.uid()");
    expect(migration).not.toContain("p_actor_id");
  });
});
