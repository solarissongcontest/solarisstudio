import { describe, expect, it } from "vitest";

import {
  normalizeSystemReceipt,
  reconcileSystemOperationServer,
} from "@/lib/system-operation-reconciliation.server";

describe("System V3 receipt reconciliation", () => {
  it("normalizes a successful legacy Organizer receipt", () => {
    const receipt = normalizeSystemReceipt<{ entryId: string }>({
      operationId: "00000000-0000-4000-8000-000000000001",
      correlationId: "00000000-0000-4000-8000-000000000002",
      command: "entry.request_changes",
      status: "succeeded",
      result: { entryId: "entry-1" },
      error: null,
      createdAt: "2026-10-15T00:00:00.000Z",
      updatedAt: "2026-10-15T00:00:01.000Z",
      completedAt: "2026-10-15T00:00:01.000Z",
    });

    expect(receipt).toMatchObject({
      operationId: "00000000-0000-4000-8000-000000000001",
      commandId: "00000000-0000-4000-8000-000000000001",
      correlationId: "00000000-0000-4000-8000-000000000002",
      command: "entry.request_changes",
      status: "succeeded",
      replayed: true,
      result: { entryId: "entry-1" },
      error: null,
      requestedAt: "2026-10-15T00:00:00.000Z",
    });
  });

  it("translates failed receipts and strips unsafe metadata", () => {
    const receipt = normalizeSystemReceipt({
      operationId: "00000000-0000-4000-8000-000000000001",
      correlationId: "00000000-0000-4000-8000-000000000002",
      command: "entry.request_changes",
      status: "failed",
      result: null,
      error: {
        code: "VERSION_CONFLICT",
        metadata: { expectedVersion: 3, actualVersion: 4, nested: { raw: true } },
      },
      createdAt: "2026-10-15T00:00:00.000Z",
      updatedAt: "2026-10-15T00:00:01.000Z",
      completedAt: "2026-10-15T00:00:01.000Z",
    });

    expect(receipt?.error).toMatchObject({
      code: "VERSION_CONFLICT",
      retryable: false,
      metadata: { expectedVersion: 3, actualVersion: 4 },
    });
    expect(receipt?.error?.metadata).not.toHaveProperty("nested");
  });

  it("uses UNKNOWN when an uncertain receipt lacks a valid error", () => {
    const receipt = normalizeSystemReceipt({
      operationId: "00000000-0000-4000-8000-000000000001",
      correlationId: "00000000-0000-4000-8000-000000000002",
      command: "entry.request_changes",
      status: "uncertain",
      result: null,
      error: { code: "raw postgres prose" },
      createdAt: "2026-10-15T00:00:00.000Z",
      updatedAt: "2026-10-15T00:00:01.000Z",
      completedAt: "2026-10-15T00:00:01.000Z",
    });
    expect(receipt?.error?.code).toBe("UNKNOWN");
  });

  it("rejects malformed receipts instead of inventing authority", () => {
    expect(normalizeSystemReceipt({ status: "succeeded" })).toBeNull();
    expect(
      normalizeSystemReceipt({
        operationId: "operation",
        correlationId: "correlation",
        command: "entry.request_changes",
        status: "made_up",
        createdAt: "now",
        updatedAt: "now",
      }),
    ).toBeNull();
  });

  it("retrieves the actor-scoped canonical receipt through the shared RPC", async () => {
    const calls: Array<[string, { p_operation_id: string }]> = [];
    const result = await reconcileSystemOperationServer("00000000-0000-4000-8000-000000000001", {
      createClient: () => ({
        rpc: async (name, parameters) => {
          calls.push([name, parameters]);
          return {
            data: {
              operationId: "00000000-0000-4000-8000-000000000001",
              correlationId: "00000000-0000-4000-8000-000000000002",
              command: "entry.request_changes",
              status: "processing",
              result: null,
              error: null,
              createdAt: "2026-10-15T00:00:00.000Z",
              updatedAt: "2026-10-15T00:00:01.000Z",
              completedAt: null,
            },
            error: null,
          };
        },
      }),
    });
    expect(calls).toEqual([
      [
        "studio2_reconcile_operation",
        {
          p_operation_id: "00000000-0000-4000-8000-000000000001",
        },
      ],
    ]);
    expect(result).toMatchObject({ ok: true, receipt: { status: "processing" } });
  });

  it("returns safe taxonomy errors instead of raw Postgres failures", async () => {
    const result = await reconcileSystemOperationServer("00000000-0000-4000-8000-000000000001", {
      createClient: () => ({
        rpc: async () => ({
          data: null,
          error: {
            code: "P0001",
            message: "IDEMPOTENCY_CONFLICT",
            details: "private.studio2_operation_receipts secret row",
          },
        }),
      }),
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "IDEMPOTENCY_CONFLICT", retryable: false },
    });
    expect(JSON.stringify(result)).not.toContain("private.studio2_operation_receipts");
    expect(JSON.stringify(result)).not.toContain("secret row");
  });
});
