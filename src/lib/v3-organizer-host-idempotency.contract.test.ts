import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync("src/lib/studio2-host-management.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260912171500_studio2_host_management.sql",
  "utf8",
);

describe("V3 Organizer Host operation idempotency", () => {
  it("preserves the first execution identity while an outcome is uncertain", () => {
    expect(service).toContain("const pendingHostExecutionIds = new Map<string, string>();");
    expect(service).toContain("const fingerprint = hostOperationFingerprint(input, reason);");
    expect(service).toContain(
      "const executionId = executionIdForHostOperation(fingerprint, input.executionId);",
    );
    expect(service).toContain("p_execution_id: executionId");

    const validatedReceipt = service.indexOf("const execution = validateHostOperationExecution(");
    const retiredIdentity = service.indexOf("pendingHostExecutionIds.delete(fingerprint);");
    expect(validatedReceipt).toBeGreaterThanOrEqual(0);
    expect(retiredIdentity).toBeGreaterThan(validatedReceipt);
  });

  it("binds retry identity to the exact semantic operation inputs", () => {
    for (const field of [
      "editionId: input.editionId",
      "action: input.action",
      "bidId: input.bidId ?? null",
      "expectedRevision: input.expectedRevision ?? null",
      "reason",
      "payload: input.payload ?? {}",
    ]) {
      expect(service).toContain(field);
    }
    expect(service).toContain("const MAX_PENDING_HOST_EXECUTIONS = 64;");
  });

  it("relies on the server's immutable execution receipt and idempotent replay", () => {
    expect(migration).toContain("where e.execution_id = p_execution_id");
    expect(migration).toContain("'idempotentReplay', true");
    expect(migration).toContain("insert into public.studio2_host_operation_executions");
    expect(migration).toContain("'idempotentReplay', false");
  });
});
