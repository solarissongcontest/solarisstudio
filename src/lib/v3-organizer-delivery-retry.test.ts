import { describe, expect, it, vi } from "vitest";

import {
  reconcileDeliveryRetry,
  retryFailedDeliveryWithReconciliation,
  type DeliveryRetryRpcClient,
} from "./v3-organizer-delivery-retry";

const DELIVERY_ID = "11111111-1111-4111-8111-111111111111";
const OPERATION_ID = "22222222-2222-4222-8222-222222222222";
const IDEMPOTENCY_KEY = "delivery-retry-key";

function succeededReceipt() {
  return {
    operationId: OPERATION_ID,
    correlationId: OPERATION_ID,
    command: "system.push.retry_failed",
    status: "succeeded",
    replayed: true,
    result: {
      ok: true,
      deliveryId: DELIVERY_ID,
      status: "pending",
      attemptCount: 1,
      operationId: OPERATION_ID,
    },
    error: null,
    createdAt: "2026-10-23T17:00:00Z",
    updatedAt: "2026-10-23T17:00:01Z",
    completedAt: "2026-10-23T17:00:01Z",
  };
}

describe("Organizer failed-delivery retry reconciliation", () => {
  it("accepts a direct authoritative retry result", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        ok: true,
        deliveryId: DELIVERY_ID,
        status: "pending",
        attemptCount: 1,
        operationId: OPERATION_ID,
      },
      error: null,
    }));

    const outcome = await retryFailedDeliveryWithReconciliation(
      {
        deliveryId: DELIVERY_ID,
        identity: { operationId: OPERATION_ID, idempotencyKey: IDEMPOTENCY_KEY },
        online: true,
      },
      { rpc } as DeliveryRetryRpcClient,
    );

    expect(outcome).toMatchObject({
      state: "succeeded",
      deliveryId: DELIVERY_ID,
      operationId: OPERATION_ID,
      reconciled: false,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("reconciles an ambiguous transport failure before permitting another mutation", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: { code: "FETCH_ERROR", message: "request failed" },
      })
      .mockResolvedValueOnce({ data: succeededReceipt(), error: null });

    const outcome = await retryFailedDeliveryWithReconciliation(
      {
        deliveryId: DELIVERY_ID,
        identity: { operationId: OPERATION_ID, idempotencyKey: IDEMPOTENCY_KEY },
        online: true,
      },
      { rpc } as DeliveryRetryRpcClient,
    );

    expect(outcome).toMatchObject({ state: "succeeded", reconciled: true });
    expect(rpc).toHaveBeenNthCalledWith(2, "studio2_reconcile_operation", {
      p_operation_id: OPERATION_ID,
    });
  });

  it("does not replay while the canonical operation is still processing", async () => {
    const processing = { ...succeededReceipt(), status: "processing", result: null, completedAt: null };
    const recovery = {
      kind: "request-failed" as const,
      action: "retry-same-operation" as const,
      title: "The server response was lost",
      description: "Outcome unknown",
      outcomeUnknown: true,
      allowSameIdentityRetry: true,
      shouldRefreshCanonical: false,
      keepOperationOpen: true,
    };
    const rpc = vi.fn(async () => ({ data: processing, error: null }));

    const outcome = await reconcileDeliveryRetry(
      { operationId: OPERATION_ID, deliveryId: DELIVERY_ID, recovery },
      { rpc } as DeliveryRetryRpcClient,
    );

    expect(outcome).toMatchObject({
      state: "unresolved",
      reason: "operation_processing",
      allowSameIdentityRetry: false,
    });
  });

  it("allows same-identity replay only when actor-scoped reconciliation proves no receipt exists", async () => {
    const recovery = {
      kind: "request-failed" as const,
      action: "retry-same-operation" as const,
      title: "The server response was lost",
      description: "Outcome unknown",
      outcomeUnknown: true,
      allowSameIdentityRetry: true,
      shouldRefreshCanonical: false,
      keepOperationOpen: true,
    };
    const rpc = vi.fn(async () => ({
      data: null,
      error: { code: "P0002", message: "UNKNOWN" },
    }));

    const outcome = await reconcileDeliveryRetry(
      { operationId: OPERATION_ID, deliveryId: DELIVERY_ID, recovery },
      { rpc } as DeliveryRetryRpcClient,
    );

    expect(outcome).toMatchObject({
      state: "unresolved",
      reason: "operation_not_found",
      allowSameIdentityRetry: true,
    });
  });

  it("fails closed when reconciliation returns another command", async () => {
    const recovery = {
      kind: "request-failed" as const,
      action: "retry-same-operation" as const,
      title: "The server response was lost",
      description: "Outcome unknown",
      outcomeUnknown: true,
      allowSameIdentityRetry: true,
      shouldRefreshCanonical: false,
      keepOperationOpen: true,
    };
    const rpc = vi.fn(async () => ({
      data: { ...succeededReceipt(), command: "entry.verify" },
      error: null,
    }));

    const outcome = await reconcileDeliveryRetry(
      { operationId: OPERATION_ID, deliveryId: DELIVERY_ID, recovery },
      { rpc } as DeliveryRetryRpcClient,
    );

    expect(outcome).toMatchObject({
      state: "unresolved",
      reason: "invalid_receipt",
      allowSameIdentityRetry: false,
    });
  });

  it("rejects a succeeded receipt for a different delivery", async () => {
    const recovery = {
      kind: "request-failed" as const,
      action: "retry-same-operation" as const,
      title: "The server response was lost",
      description: "Outcome unknown",
      outcomeUnknown: true,
      allowSameIdentityRetry: true,
      shouldRefreshCanonical: false,
      keepOperationOpen: true,
    };
    const rpc = vi.fn(async () => ({
      data: {
        ...succeededReceipt(),
        result: {
          ...(succeededReceipt().result as Record<string, unknown>),
          deliveryId: "99999999-9999-4999-8999-999999999999",
        },
      },
      error: null,
    }));

    await expect(
      reconcileDeliveryRetry(
        { operationId: OPERATION_ID, deliveryId: DELIVERY_ID, recovery },
        { rpc } as DeliveryRetryRpcClient,
      ),
    ).rejects.toThrow("does not match the reviewed delivery operation");
  });
});
