import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { createOrganisationCommand } from "@/lib/organisation-operation-contract";
import { normalizeSystemReceipt } from "@/lib/system-receipt";
import type { SystemJsonValue, SystemReceipt } from "@/lib/system-operation-contract";

const supabase = typedSupabase as any;

export type CountryAccountStatus = "active" | "suspended";

export type CountryAccountStatusOperationIdentity = {
  operationId: string;
  idempotencyKey: string;
  correlationId: string;
};

export type CountryAccountStatusResult = {
  ok: boolean;
  operationId: string;
  receiptId: string;
  userId: string;
  countryId: string;
  previousStatus: CountryAccountStatus;
  status: CountryAccountStatus;
  suspensionReason: string | null;
  previousUpdatedAt: string;
  updatedAt: string;
  serverTime: string;
  sessionEffect: string;
};

export type ApplyCountryAccountStatusInput = {
  userId: string;
  countryId: string;
  currentUpdatedAt: string;
  targetStatus: CountryAccountStatus;
  reason?: string | null;
  operationIdentity?: CountryAccountStatusOperationIdentity;
};

export function createCountryAccountStatusOperationIdentity(): CountryAccountStatusOperationIdentity {
  const operationId = crypto.randomUUID();
  return {
    operationId,
    idempotencyKey: operationId,
    correlationId: operationId,
  };
}

function resolveOperationIdentity(
  identity: CountryAccountStatusOperationIdentity | undefined,
): CountryAccountStatusOperationIdentity {
  const resolved = identity ?? createCountryAccountStatusOperationIdentity();
  if (
    !resolved.operationId?.trim() ||
    !resolved.idempotencyKey?.trim() ||
    !resolved.correlationId?.trim()
  ) {
    throw new Error("Country-account access command requires a stable operation identity.");
  }
  return resolved;
}

function requireSucceededReceipt(
  receipt: SystemReceipt<SystemJsonValue> | null,
  operationId: string,
): SystemReceipt<SystemJsonValue> {
  if (!receipt || receipt.operationId !== operationId) {
    throw new Error("Country-account access command returned an invalid operation receipt.");
  }
  if (receipt.status === "succeeded") return receipt;

  if (receipt.status === "failed") {
    const failure = new Error(
      receipt.error?.message ?? "Country-account access command failed authoritatively.",
    );
    Object.assign(failure, {
      code: receipt.error?.code ?? "UNKNOWN",
      operationId,
      status: receipt.status,
    });
    throw failure;
  }

  const unresolved = new Error(
    "Country-account access command outcome is not confirmed. Reconcile the same operation before retrying.",
  );
  Object.assign(unresolved, {
    code: receipt.error?.code ?? "TIMEOUT",
    operationId,
    status: receipt.status,
  });
  throw unresolved;
}

/**
 * Apply a reviewed country-account access transition through the canonical V3
 * operation boundary. The caller must pass the exact updated_at value that was
 * reviewed. A transport failure is reconciled once by immutable operation id;
 * the mutation itself is never blindly retried. Callers that expose a human
 * retry surface must retain and resupply operationIdentity so an unresolved
 * mutation/reconciliation outage cannot allocate a second official operation.
 */
export async function applyCountryAccountStatusV3(
  input: ApplyCountryAccountStatusInput,
): Promise<SystemReceipt<SystemJsonValue>> {
  const reason = input.targetStatus === "suspended" ? input.reason?.trim() || null : null;
  const operationIdentity = resolveOperationIdentity(input.operationIdentity);
  const commandName =
    input.targetStatus === "suspended" ? "delegation.suspend" : "delegation.restore";
  const command = createOrganisationCommand({
    command: commandName,
    riskClass: "R2",
    scope: { countryId: input.countryId },
    expectedVersion: input.currentUpdatedAt,
    reason,
    payload: {
      userId: input.userId,
      countryId: input.countryId,
      targetStatus: input.targetStatus,
      reason,
      expectedUpdatedAt: input.currentUpdatedAt,
    },
    operationId: operationIdentity.operationId,
    idempotencyKey: operationIdentity.idempotencyKey,
    correlationId: operationIdentity.correlationId,
  });

  const mutation = await supabase.rpc("studio2_set_country_account_status_v3", {
    p_user_id: input.userId,
    p_country_id: input.countryId,
    p_target_status: input.targetStatus,
    p_reason: reason,
    p_expected_updated_at: input.currentUpdatedAt,
    p_operation_id: command.operationId,
    p_idempotency_key: command.idempotencyKey,
    p_correlation_id: command.correlationId,
  });

  if (!mutation.error) {
    return requireSucceededReceipt(normalizeSystemReceipt(mutation.data), command.operationId);
  }

  // Do not retry the mutation after an uncertain response. Reconcile the stable
  // operation identity exactly once. A valid authoritative receipt wins over
  // the transport error, including a durable failed receipt with its real code.
  const reconciliation = await supabase.rpc("studio2_reconcile_operation", {
    p_operation_id: command.operationId,
  });
  if (!reconciliation.error) {
    const receipt = normalizeSystemReceipt(reconciliation.data);
    if (receipt?.operationId === command.operationId) {
      return requireSucceededReceipt(receipt, command.operationId);
    }
  }

  throw mutation.error;
}
