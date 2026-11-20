import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync("src/lib/studio2-host-management.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260912171500_studio2_host_management.sql",
  "utf8",
);

describe("V3 Organizer Host operation idempotency", () => {
  it("preserves one execution identity while an outcome is uncertain", () => {
    expect(service).toContain(
      "const pendingHostExecutions = new Map<string, PendingHostExecution>();",
    );
    expect(service).toContain(
      "const identityFingerprint = hostOperationIdentityFingerprint(input);",
    );
    expect(service).toContain(
      "const requestFingerprint = hostOperationRequestFingerprint(input, reason);",
    );
    expect(service).toContain(
      "const executionId = executionIdForHostOperation(\n    identityFingerprint,\n    requestFingerprint,\n    input.executionId,\n  );",
    );
    expect(service).toContain("p_execution_id: executionId");

    const validatedReceipt = service.indexOf("const execution = validateHostOperationExecution(");
    const retiredIdentity = service.indexOf(
      "pendingHostExecutions.delete(identityFingerprint);",
    );
    expect(validatedReceipt).toBeGreaterThanOrEqual(0);
    expect(retiredIdentity).toBeGreaterThan(validatedReceipt);
  });

  it("separates reviewed operation identity from the exact attempted payload", () => {
    const identityStart = service.indexOf("function hostOperationIdentityFingerprint");
    const requestStart = service.indexOf("function hostOperationRequestFingerprint");
    const reserveStart = service.indexOf("function executionIdForHostOperation");

    expect(identityStart).toBeGreaterThanOrEqual(0);
    expect(requestStart).toBeGreaterThan(identityStart);
    expect(reserveStart).toBeGreaterThan(requestStart);

    const identitySource = service.slice(identityStart, requestStart);
    const requestSource = service.slice(requestStart, reserveStart);

    for (const field of [
      "editionId: input.editionId",
      "action: input.action",
      "bidId: input.bidId ?? null",
      "expectedRevision: input.expectedRevision ?? null",
      "payload: input.payload ?? {}",
    ]) {
      expect(identitySource).toContain(field);
      expect(requestSource).toContain(field);
    }

    expect(identitySource).not.toContain("reason,");
    expect(requestSource).toContain("reason,");
    expect(service).toContain("existing.requestFingerprint !== requestFingerprint");
    expect(service).toContain(
      "already has an unresolved attempt with a different audit reason or payload",
    );
    expect(service).toContain("const MAX_PENDING_HOST_EXECUTIONS = 64;");
  });

  it("validates the receipt before retiring uncertain-operation identity", () => {
    expect(service).toContain("bidId: input.bidId");
    expect(service).toContain("reason,");
    expect(service).toContain(
      "if (execution.bidId !== (request.bidId ?? null)) mismatches.push('bidId');",
    );
    expect(service).toContain(
      "if (execution.reason !== request.reason) mismatches.push('reason');",
    );
  });

  it("relies on the server's immutable execution receipt and idempotent replay", () => {
    expect(migration).toContain("where e.execution_id = p_execution_id");
    expect(migration).toContain("'idempotentReplay', true");
    expect(migration).toContain("insert into public.studio2_host_operation_executions");
    expect(migration).toContain("'idempotentReplay', false");
  });
});
