import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { createOrganisationCommand } from "@/lib/organisation-operation-contract";
import { normalizeSystemReceipt } from "@/lib/system-receipt";
import type { SystemJsonValue, SystemReceipt } from "@/lib/system-operation-contract";

const supabase = typedSupabase as any;

export type CountryAccountStatus = "active" | "suspended";

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
};

/**
 * Apply a reviewed country-account access transition through the canonical V3
 * operation boundary. The caller must pass the exact updated_at value that was
 * reviewed. A transport failure is reconciled once by immutable operation id;
 * the mutation itself is never blindly retried.
 */
export async function applyCountryAccountStatusV3(
  input: ApplyCountryAccountStatusInput,
): Promise<SystemReceipt<SystemJsonValue>> {
  const reason = input.targetStatus === "suspended" ? input.reason?.trim() || null : null;
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
    const receipt = normalizeSystemReceipt(mutation.data);
    if (!receipt || receipt.operationId !== command.operationId || receipt.status !== "succeeded") {
      throw new Error("Country-account access command returned an invalid operation receipt.");
    }
    return receipt;
  }

  // Do not retry the mutation after an uncertain response. Reconcile the stable
  // operation identity exactly once. Deterministic pre-commit failures roll the
  // claim back, so reconciliation will simply fail and the original error wins.
  const reconciliation = await supabase.rpc("studio2_reconcile_operation", {
    p_operation_id: command.operationId,
  });
  if (!reconciliation.error) {
    const receipt = normalizeSystemReceipt(reconciliation.data);
    if (receipt?.operationId === command.operationId && receipt.status === "succeeded") {
      return receipt;
    }
  }

  throw mutation.error;
}
