import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const hostManagement = readFileSync("src/lib/studio2-host-management.ts", "utf8");

describe("Studio2 Host Management uncertain-outcome reconciliation", () => {
  it("keeps one execution identity while a host operation outcome is uncertain", () => {
    expect(hostManagement).toContain(
      "const pendingHostExecutionIds = new Map<string, string>();",
    );
    expect(hostManagement).toContain(
      "const existing = pendingHostExecutionIds.get(fingerprint);",
    );
    expect(hostManagement).toContain("if (existing) return existing;");
    expect(hostManagement).toContain(
      "pendingHostExecutionIds.set(fingerprint, proposedExecutionId);",
    );
  });

  it("sends the retained execution id to the governed host RPC", () => {
    expect(hostManagement).toContain(
      "const executionId = executionIdForHostOperation(fingerprint, input.executionId);",
    );
    expect(hostManagement).toContain("p_execution_id: executionId");
    expect(hostManagement).not.toContain("p_execution_id: input.executionId");
  });

  it("clears the uncertain identity only after the server receipt proves it belongs to the command", () => {
    const executeStart = hostManagement.indexOf(
      "export async function executeStudio2HostOperation",
    );
    const rpcCall = hostManagement.indexOf(
      "const data = await rpc('studio2_execute_host_operation'",
      executeStart,
    );
    const validate = hostManagement.indexOf(
      "const execution = validateHostOperationExecution(parseExecution(data)",
      rpcCall,
    );
    const clear = hostManagement.indexOf(
      "pendingHostExecutionIds.delete(fingerprint);",
      validate,
    );
    const returned = hostManagement.indexOf("return execution;", clear);

    expect(executeStart).toBeGreaterThanOrEqual(0);
    expect(rpcCall).toBeGreaterThan(executeStart);
    expect(validate).toBeGreaterThan(rpcCall);
    expect(clear).toBeGreaterThan(validate);
    expect(returned).toBeGreaterThan(clear);
  });

  it("binds retry identity to the complete semantic host operation", () => {
    for (const field of [
      "editionId: input.editionId",
      "action: input.action",
      "bidId: input.bidId ?? null",
      "expectedRevision: input.expectedRevision ?? null",
      "reason",
      "payload: input.payload ?? {}",
    ]) {
      expect(hostManagement).toContain(field);
    }
  });
});