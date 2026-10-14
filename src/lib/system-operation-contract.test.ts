import { describe, expect, it } from "vitest";

import {
  SYSTEM_ERROR_CODES,
  SYSTEM_OPERATION_STATUSES,
  correlationContext,
  createSystemCommand,
  type SystemCommand,
} from "./system-operation-contract";

describe("System V3 S2 shared operation contract", () => {
  it("defines one operation status and error vocabulary", () => {
    expect(SYSTEM_OPERATION_STATUSES).toEqual(["processing", "succeeded", "failed", "uncertain"]);
    expect(SYSTEM_ERROR_CODES).toEqual([
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
    ]);
  });

  it("creates stable operation, idempotency and correlation identities", () => {
    const command = createSystemCommand({
      command: "entry.request_changes",
      payload: { revisionId: "revision-4" },
      commandId: "command-1",
      operationId: "operation-1",
      idempotencyKey: "retry-key-1",
      correlationId: "correlation-1",
      expectedVersion: 4,
      editionId: "ssc-22",
      subjectType: "entry-revision",
      subjectId: "revision-4",
      reason: "Media credit is missing",
      requestedAt: "2026-10-14T19:00:00.000Z",
    });

    expect(command).toMatchObject({
      commandId: "command-1",
      operationId: "operation-1",
      idempotencyKey: "retry-key-1",
      correlationId: "correlation-1",
      expectedVersion: 4,
      command: "entry.request_changes",
    });
    expect(correlationContext(command, "request-1")).toEqual({
      requestId: "request-1",
      operationId: "operation-1",
      correlationId: "correlation-1",
    });
  });

  it("does not put browser-supplied actor identity in the command contract", () => {
    type CommandHasActorId = "actorId" extends keyof SystemCommand<unknown> ? true : false;
    const commandHasActorId: CommandHasActorId = false;
    const keys: Array<keyof SystemCommand<unknown>> = [
      "commandId",
      "operationId",
      "idempotencyKey",
      "correlationId",
      "command",
      "payload",
      "requestedAt",
    ];
    expect(commandHasActorId).toBe(false);
    expect(keys).not.toContain("actorId");
  });
});
