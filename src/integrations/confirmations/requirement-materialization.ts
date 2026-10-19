import { confirmationsSupabase } from "@/integrations/confirmations/client";

export type ConfirmationRequirementMaterializationTarget = {
  countryId: string;
  countryName: string;
  countryCode: string;
  currentRequirementId: string | null;
  currentGeneration: number | null;
  currentStatus: "required" | "satisfied" | "waived" | "invalidated" | null;
  currentUpdatedAt: string | null;
  willCreate: boolean;
};

export type ConfirmationRequirementMaterializationPreview = {
  editionId: string;
  targetMode: "all_active" | "explicit";
  requestedCountryIds: string[] | null;
  targetReason: string;
  targetGeneration: number;
  targetCount: number;
  createCount: number;
  targets: ConfirmationRequirementMaterializationTarget[];
  createTargets: ConfirmationRequirementMaterializationTarget[];
  impactFingerprint: string;
  serverTime: string;
};

export type ConfirmationRequirementMaterializationCreatedRow = {
  requirementId: string;
  countryId: string;
  countryName: string;
  countryCode: string;
  generation: number;
  status: "required" | "satisfied" | "waived" | "invalidated";
};

export type ConfirmationRequirementMaterializationResult = {
  ok: boolean;
  replayed: boolean;
  operationId: string;
  receiptId?: string;
  editionId?: string;
  status?: string;
  appliedFingerprint?: string;
  resultingFingerprint?: string;
  targetCount?: number;
  created?: number;
  createdRequirements?: ConfirmationRequirementMaterializationCreatedRow[];
  reconciliationRequired?: boolean;
  currentPreview?: ConfirmationRequirementMaterializationPreview;
  error?: {
    code?: string;
    metadata?: Record<string, unknown>;
  } | null;
  serverTime: string;
};

type OperationReceipt = {
  operationId: string;
  status: "processing" | "succeeded" | "failed" | "uncertain";
  result?: ConfirmationRequirementMaterializationResult | null;
  error?: ConfirmationRequirementMaterializationResult["error"];
};

export async function previewConfirmationRequirementMaterialization(input: {
  editionId: string;
  countryIds?: string[] | null;
}): Promise<ConfirmationRequirementMaterializationPreview> {
  const { data, error } = await confirmationsSupabase.rpc(
    "admin_confirmation_requirement_materialization_preview",
    {
      p_edition_id: input.editionId,
      p_country_ids: input.countryIds?.length ? input.countryIds : null,
    },
  );

  if (error) throw error;
  return data as ConfirmationRequirementMaterializationPreview;
}

export async function applyConfirmationRequirementMaterialization(input: {
  editionId: string;
  countryIds?: string[] | null;
  expectedFingerprint: string;
  operationId: string;
  idempotencyKey: string;
  correlationId?: string | null;
}): Promise<ConfirmationRequirementMaterializationResult> {
  const request = {
    p_edition_id: input.editionId,
    p_country_ids: input.countryIds?.length ? input.countryIds : null,
    p_expected_fingerprint: input.expectedFingerprint,
    p_operation_id: input.operationId,
    p_idempotency_key: input.idempotencyKey,
    p_correlation_id: input.correlationId ?? null,
  };

  const { data, error } = await confirmationsSupabase.rpc(
    "admin_confirmation_apply_requirement_materialization",
    request,
  );

  if (!error) {
    return data as ConfirmationRequirementMaterializationResult;
  }

  // A transport error can happen after PostgreSQL committed. Reconcile the exact
  // actor-bound operation once instead of inventing a second mutation attempt.
  const { data: receiptData, error: receiptError } = await confirmationsSupabase.rpc(
    "studio2_reconcile_operation",
    { p_operation_id: input.operationId },
  );

  if (!receiptError && receiptData) {
    const receipt = receiptData as OperationReceipt;
    if (receipt.status === "succeeded" && receipt.result) {
      return { ...receipt.result, replayed: true };
    }

    if (receipt.status === "failed") {
      return {
        ok: false,
        replayed: true,
        operationId: receipt.operationId,
        status: receipt.status,
        error: receipt.error ?? null,
        reconciliationRequired: false,
        serverTime: new Date().toISOString(),
      };
    }

    return {
      ok: false,
      replayed: true,
      operationId: receipt.operationId,
      status: receipt.status,
      error: receipt.error ?? null,
      reconciliationRequired: true,
      serverTime: new Date().toISOString(),
    };
  }

  throw error;
}
