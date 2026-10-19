import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");
const migration = source(
  "supabase/migrations/20261019235900_v3_integrity_case_idempotency.sql",
);

describe("V3 Integrity case idempotency", () => {
  it("keeps anonymous retry identity private while making the recovery response replayable", () => {
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
    expect(migration).toContain("extensions.pgp_sym_encrypt");
    expect(migration).toContain("extensions.pgp_sym_decrypt");
    expect(migration).toContain("extensions.digest(convert_to(v_key, 'UTF8'), 'sha256')");
    expect(migration).toContain("where operation_row.idempotency_key_hash = v_key_hash\n  for update");
    expect(migration).toContain("v_operation.request_fingerprint is distinct from v_fingerprint");
    expect(migration).toContain("'recovery_key', v_recovery_secret");
    expect(migration).toContain("'replayed', true");
  });

  it("serializes concurrent anonymous retries before creating the canonical case", () => {
    const insertIndex = migration.indexOf(
      "insert into private.v3_anonymous_integrity_case_operations",
    );
    const conflictIndex = migration.indexOf("on conflict do nothing", insertIndex);
    const lockIndex = migration.indexOf("for update;", conflictIndex);
    const caseInsertIndex = migration.indexOf("insert into public.integrity_cases", lockIndex);

    expect(insertIndex).toBeGreaterThanOrEqual(0);
    expect(conflictIndex).toBeGreaterThan(insertIndex);
    expect(lockIndex).toBeGreaterThan(conflictIndex);
    expect(caseInsertIndex).toBeGreaterThan(lockIndex);
  });

  it("backs protected reports with the canonical authenticated operation receipt", () => {
    const protectedStart = migration.indexOf(
      "create or replace function public.v3_create_protected_integrity_case",
    );
    const protected = migration.slice(protectedStart);

    expect(protectedStart).toBeGreaterThanOrEqual(0);
    expect(protected).toContain("v_actor uuid := auth.uid()");
    expect(protected).toContain("insert into public.studio2_operation_receipts");
    expect(protected).toContain("'integrity.case.create.protected'");
    expect(protected).toContain("request_fingerprint");
    expect(protected).toContain("for update");
    expect(protected).toContain("perform private.studio2_complete_operation");
    expect(protected).toContain("'receipt_id', v_canonical_operation_id");
    expect(protected).toContain("v_receipt.request_fingerprint is distinct from v_fingerprint");
  });

  it("reuses one browser operation identity for an unchanged draft and invalidates it on edits", () => {
    const model = source("src/lib/integrity-report-v5.ts");
    const flow = source("src/components/integrity/IntegrityReportV5.tsx");
    const anonymousSubmitter = source("src/lib/integrity-case-create.functions.ts");
    const protectedSubmitter = source("src/lib/integrity-case-create.ts");

    expect(model).toContain("SUBMISSION_IDENTITY_KEY");
    expect(model).toContain("getOrCreateIntegrityReportV5SubmissionIdentity");
    expect(model).toContain("if (semanticChange) clearIntegrityReportV5SubmissionIdentity()");
    expect(model).toContain("randomHex(32)");
    expect(model).not.toContain("localStorage");

    expect(flow).toContain("getOrCreateIntegrityReportV5SubmissionIdentity()");
    expect(flow).toContain("operationId: submissionIdentity.operationId");
    expect(flow).toContain("idempotencyKey: submissionIdentity.idempotencyKey");
    expect(flow).toContain("createIdempotentProtectedIntegrityCase(submissionIdentity");

    expect(anonymousSubmitter).toContain('"v3_public_create_anonymous_integrity_case"');
    expect(protectedSubmitter).toContain('"v3_create_protected_integrity_case"');
  });

  it("keeps anonymous intake anonymous and protected intake actor-bound", () => {
    const anonymousStart = migration.indexOf(
      "create or replace function public.v3_public_create_anonymous_integrity_case",
    );
    const protectedStart = migration.indexOf(
      "create or replace function public.v3_create_protected_integrity_case",
    );
    const anonymous = migration.slice(anonymousStart, protectedStart);
    const protected = migration.slice(protectedStart);

    expect(anonymous).toContain("'anonymous'");
    expect(anonymous).toContain("reporter_user_id");
    expect(anonymous).toContain("null,");
    expect(anonymous).not.toContain("auth.uid()");
    expect(protected).toContain("v_actor uuid := auth.uid()");
    expect(protected).toContain("v_actor,");
  });
});
