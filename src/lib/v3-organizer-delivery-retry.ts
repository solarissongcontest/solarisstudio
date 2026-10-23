import { supabase as baseSupabase } from "@/integrations/supabase/client";
import { normalizeSystemReceipt } from "@/lib/system-receipt";
import {
  resolveSolarisV6OperationRecovery,
  type SolarisV6OperationRecovery,
} from "@/lib/solaris-v6-operation-recovery";

export const DELIVERY_RETRY_COMMAND = "system.push.retry_failed" as const;

export type DeliveryRetryIdentity = {
  operationId: string;
  idempotencyKey: string;
};

export type DeliveryRetrySuccess = {
  state: "succeeded";
  operationId: string;
  deliveryId: string;
  reconciled: boolean;
};

export type DeliveryRetryUnresolved = {
  state: "unresolved";
  operationId: string;
  deliveryId: string;
  reason:
    | "operation_processing"
    | "operation_uncertain"
    | "operation_not_found"
    | "reconciliation_unavailable"
    | "invalid_receipt";
  recovery: SolarisV6OperationRecovery;
  allowSameIdentityRetry: boolean;
};

export type DeliveryRetryFailure = {
  state: "failed";
  operationId: string;
  deliveryId: string;
  error: unknown;
  recovery: SolarisV6OperationRecovery;
};

export type DeliveryRetryOutcome =
  | DeliveryRetrySuccess
  | DeliveryRetryUnresolved
  | DeliveryRetryFailure;

type RpcError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

export type DeliveryRetryRpcClient = {
  rpc(
    name: string,
    params: Record<string, unknown>,
  ): Promise<{ data: unknown; error: RpcError | null }>;
};

const defaultClient = baseSupabase as unknown as DeliveryRetryRpcClient;

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isSettledRetryResult(
  data: unknown,
  input: { operationId: string; deliveryId: string },
) {
  const row = objectValue(data);
  return Boolean(
    row &&
      row.ok === true &&
      row.operationId === input.operationId &&
      row.deliveryId === input.deliveryId &&
      row.status === "pending",
  );
}

function isMissingReceipt(error: RpcError | null) {
  return error?.code === "P0002" && error.message === "UNKNOWN";
}

function invalidReceiptOutcome(
  input: {
    operationId: string;
    deliveryId: string;
    recovery: SolarisV6OperationRecovery;
  },
): DeliveryRetryUnresolved {
  return {
    state: "unresolved",
    operationId: input.operationId,
    deliveryId: input.deliveryId,
    reason: "invalid_receipt",
    recovery: input.recovery,
    allowSameIdentityRetry: false,
  };
}

export async function reconcileDeliveryRetry(
  input: {
    operationId: string;
    deliveryId: string;
    recovery: SolarisV6OperationRecovery;
  },
  client: DeliveryRetryRpcClient = defaultClient,
): Promise<DeliveryRetryOutcome> {
  const { data, error } = await client.rpc("studio2_reconcile_operation", {
    p_operation_id: input.operationId,
  });

  if (error) {
    return {
      state: "unresolved",
      operationId: input.operationId,
      deliveryId: input.deliveryId,
      reason: isMissingReceipt(error)
        ? "operation_not_found"
        : "reconciliation_unavailable",
      recovery: input.recovery,
      // A definite actor-scoped missing receipt proves this exact operation was
      // never accepted. Only then may the same reviewed mutation identity be
      // replayed. Other reconciliation failures remain fail-closed.
      allowSameIdentityRetry: isMissingReceipt(error) && input.recovery.allowSameIdentityRetry,
    };
  }

  const receipt = normalizeSystemReceipt(data);
  if (
    !receipt ||
    receipt.operationId !== input.operationId ||
    receipt.command !== DELIVERY_RETRY_COMMAND
  ) {
    return invalidReceiptOutcome(input);
  }

  if (receipt.status === "succeeded") {
    if (!isSettledRetryResult(receipt.result, input)) {
      return invalidReceiptOutcome(input);
    }
    return {
      state: "succeeded",
      operationId: input.operationId,
      deliveryId: input.deliveryId,
      reconciled: true,
    };
  }

  if (receipt.status === "failed") {
    return {
      state: "failed",
      operationId: input.operationId,
      deliveryId: input.deliveryId,
      error: receipt.error ?? new Error("Delivery retry failed."),
      recovery: resolveSolarisV6OperationRecovery(receipt.error ?? "request failed", {
        online: true,
        stableOperationIdentity: false,
      }),
    };
  }

  return {
    state: "unresolved",
    operationId: input.operationId,
    deliveryId: input.deliveryId,
    reason:
      receipt.status === "uncertain"
        ? "operation_uncertain"
        : "operation_processing",
    recovery: input.recovery,
    allowSameIdentityRetry: false,
  };
}

export async function retryFailedDeliveryWithReconciliation(
  input: {
    deliveryId: string;
    identity: DeliveryRetryIdentity;
    online?: boolean;
  },
  client: DeliveryRetryRpcClient = defaultClient,
): Promise<DeliveryRetryOutcome> {
  const { data, error } = await client.rpc(
    "admin_retry_failed_notification_delivery",
    {
      p_delivery_id: input.deliveryId,
      p_operation_id: input.identity.operationId,
      p_idempotency_key: input.identity.idempotencyKey,
    },
  );

  if (!error) {
    if (!isSettledRetryResult(data, {
      operationId: input.identity.operationId,
      deliveryId: input.deliveryId,
    })) {
      return invalidReceiptOutcome({
        operationId: input.identity.operationId,
        deliveryId: input.deliveryId,
        recovery: resolveSolarisV6OperationRecovery("invalid authoritative result", {
          online: true,
          stableOperationIdentity: true,
        }),
      });
    }
    return {
      state: "succeeded",
      operationId: input.identity.operationId,
      deliveryId: input.deliveryId,
      reconciled: false,
    };
  }

  const recovery = resolveSolarisV6OperationRecovery(error, {
    online: input.online ?? (typeof navigator === "undefined" ? true : navigator.onLine),
    stableOperationIdentity: true,
  });

  if (!recovery.outcomeUnknown) {
    return {
      state: "failed",
      operationId: input.identity.operationId,
      deliveryId: input.deliveryId,
      error,
      recovery,
    };
  }

  return reconcileDeliveryRetry(
    {
      operationId: input.identity.operationId,
      deliveryId: input.deliveryId,
      recovery,
    },
    client,
  );
}
