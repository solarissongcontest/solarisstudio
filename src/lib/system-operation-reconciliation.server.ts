import { createSolarisAuthenticatedClientServer } from "@/integrations/supabase/organizer.server";
import { createSystemError, toSystemError } from "@/lib/system-error";
import {
  SYSTEM_OPERATION_STATUSES,
  type SystemError,
  type SystemErrorCode,
  type SystemJsonValue,
  type SystemOperationStatus,
  type SystemReceipt,
} from "@/lib/system-operation-contract";

type WireSystemError = {
  code?: unknown;
  metadata?: unknown;
};

type WireSystemReceipt = {
  operationId?: unknown;
  correlationId?: unknown;
  command?: unknown;
  status?: unknown;
  result?: unknown;
  error?: WireSystemError | null;
  createdAt?: unknown;
  updatedAt?: unknown;
  completedAt?: unknown;
};

export type SystemReconciliationResult<TResult extends SystemJsonValue = SystemJsonValue> =
  | { ok: true; receipt: SystemReceipt<TResult> }
  | { ok: false; error: SystemError };

export async function reconcileSystemOperationServer<
  TResult extends SystemJsonValue = SystemJsonValue,
>(operationId: string): Promise<SystemReconciliationResult<TResult>> {
  try {
    const client = createSolarisAuthenticatedClientServer();
    const { data, error } = await (client as any).rpc("studio2_reconcile_operation", {
      p_operation_id: operationId,
    });

    if (error) return { ok: false, error: toSystemError(error) };
    const receipt = normalizeSystemReceipt<TResult>(data);
    if (!receipt) return { ok: false, error: createSystemError("DATABASE") };
    return { ok: true, receipt };
  } catch (error) {
    return { ok: false, error: toSystemError(error) };
  }
}

export function normalizeSystemReceipt<TResult extends SystemJsonValue = SystemJsonValue>(
  value: unknown,
): SystemReceipt<TResult> | null {
  if (!value || typeof value !== "object") return null;
  const wire = value as WireSystemReceipt;
  if (
    typeof wire.operationId !== "string" ||
    typeof wire.correlationId !== "string" ||
    typeof wire.command !== "string" ||
    !isOperationStatus(wire.status) ||
    typeof wire.createdAt !== "string" ||
    typeof wire.updatedAt !== "string"
  ) {
    return null;
  }

  const error = normalizeWireError(wire.error, wire.status);
  return {
    operationId: wire.operationId,
    // The pre-V3 Organizer ledger did not persist commandId separately. Its
    // immutable operationId is the compatibility identity until a migrated
    // command supplies a dedicated command relationship.
    commandId: wire.operationId,
    correlationId: wire.correlationId,
    command: wire.command,
    status: wire.status,
    replayed: true,
    result: (wire.result ?? null) as TResult | null,
    error,
    // createdAt is the server-authoritative request acceptance time.
    requestedAt: wire.createdAt,
    updatedAt: wire.updatedAt,
    completedAt: typeof wire.completedAt === "string" ? wire.completedAt : null,
  };
}

function normalizeWireError(
  wire: WireSystemError | null | undefined,
  status: SystemOperationStatus,
): SystemError | null {
  if (status !== "failed" && status !== "uncertain") return null;
  const code: SystemErrorCode =
    wire && typeof wire.code === "string" ? toSystemError(wire.code).code : "UNKNOWN";
  const metadata =
    wire?.metadata && typeof wire.metadata === "object" && !Array.isArray(wire.metadata)
      ? (wire.metadata as Record<string, unknown>)
      : undefined;
  return createSystemError(code, metadata);
}

function isOperationStatus(value: unknown): value is SystemOperationStatus {
  return (
    typeof value === "string" && (SYSTEM_OPERATION_STATUSES as readonly string[]).includes(value)
  );
}
