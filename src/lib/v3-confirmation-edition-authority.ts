import { confirmationsSupabase } from "@/integrations/confirmations/client";

export type ConfirmationEditionBindingState = "linked" | "missing" | "stale" | "conflict";
export type ConfirmationEditionRiskClass = "R2" | "R3";

export type ConfirmationEditionAuthoritySnapshot = {
  schemaVersion: number;
  editionId: string;
  edition: {
    id: string;
    name: string;
    editionNumber: number | null;
    description: string | null;
    status: string;
    editingEnabled: boolean;
  };
  confirmationEdition: {
    remoteId: string;
    name: string;
    editionNumber: number | null;
    description: string | null;
    status: string;
  } | null;
  binding: {
    id: string;
    solarisId: string;
    remoteId: string;
    editionId: string | null;
    syncStatus: string;
    lastSyncedAt: string | null;
  } | null;
  bindingState: ConfirmationEditionBindingState;
  bindingValid: boolean;
  reverseConflict: {
    id: string;
    solarisId: string;
    remoteId: string;
    editionId: string | null;
  } | null;
  roundCount: number;
  responseCount: number;
  stateVersion: number;
  serverTime: string;
};

export type ConfirmationEditionLinkPreview = ConfirmationEditionAuthoritySnapshot & {
  riskClass: "R2";
  alreadyApplied: boolean;
  willCreateBinding: boolean;
  willRepairBinding: boolean;
  blockers: string[];
};

export type ConfirmationEditionEditingPreview = ConfirmationEditionAuthoritySnapshot & {
  riskClass: ConfirmationEditionRiskClass;
  currentEditingEnabled: boolean;
  targetEditingEnabled: boolean;
  alreadyApplied: boolean;
  openRoundCount: number;
  requiresFreshAuth: boolean;
  expectedRemoteId: string | null;
  blockers: string[];
};

export type ConfirmationEditionOperationResult = {
  ok: true;
  editionId: string;
  operationId: string;
  receiptId: string;
  version: number;
  replayed?: boolean;
  bindingId?: string;
  remoteId?: string;
  bindingState?: "linked";
  editingEnabled?: boolean;
  riskClass?: ConfirmationEditionRiskClass;
};

type RpcError = { message?: string; code?: string } | null;

type ReconciledReceipt = {
  operationId?: string;
  status?: string;
  result?: unknown;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function errorMessage(error: RpcError, fallback: string) {
  const message = error?.message?.trim();
  return message || fallback;
}

function normalizeSnapshot(value: unknown): ConfirmationEditionAuthoritySnapshot {
  const row = asObject(value);
  const edition = asObject(row?.edition);
  if (
    !row ||
    typeof row.editionId !== "string" ||
    !edition ||
    typeof edition.id !== "string" ||
    typeof edition.name !== "string" ||
    typeof row.stateVersion !== "number"
  ) {
    throw new Error("Confirmation edition authority returned an invalid projection.");
  }
  return value as ConfirmationEditionAuthoritySnapshot;
}

function normalizeOperationResult(
  value: unknown,
  expectedEditionId: string,
): ConfirmationEditionOperationResult | null {
  const direct = asObject(value);
  const receipt = direct as ReconciledReceipt | null;
  const candidate =
    receipt?.status === "succeeded" && receipt.result
      ? asObject(receipt.result)
      : direct;

  if (
    !candidate ||
    candidate.ok !== true ||
    candidate.editionId !== expectedEditionId ||
    typeof candidate.operationId !== "string" ||
    typeof candidate.receiptId !== "string" ||
    typeof candidate.version !== "number"
  ) {
    return null;
  }

  return {
    ...(candidate as ConfirmationEditionOperationResult),
    replayed: direct?.replayed === true || undefined,
  };
}

async function reconcileLostResponse(
  operationId: string,
  expectedEditionId: string,
): Promise<ConfirmationEditionOperationResult | null> {
  const { data, error } = await (confirmationsSupabase as any).rpc(
    "studio2_reconcile_operation",
    { p_operation_id: operationId },
  );
  if (error) return null;
  return normalizeOperationResult(data, expectedEditionId);
}

async function applyGovernedOperation(
  rpcName: string,
  params: Record<string, unknown>,
  operationId: string,
  expectedEditionId: string,
): Promise<ConfirmationEditionOperationResult> {
  const { data, error } = await (confirmationsSupabase as any).rpc(rpcName, params);
  if (!error) {
    const result = normalizeOperationResult(data, expectedEditionId);
    if (result) return result;
    throw new Error("Confirmation edition operation returned an invalid receipt.");
  }

  // A response may be lost after the database committed. Reconcile the exact
  // operation once before surfacing the original error; never blindly retry the
  // mutation with a new identity.
  const reconciled = await reconcileLostResponse(operationId, expectedEditionId);
  if (reconciled) return reconciled;
  throw new Error(errorMessage(error, "Confirmation edition operation failed."));
}

export async function loadConfirmationEditionAuthority(
  editionId: string,
): Promise<ConfirmationEditionAuthoritySnapshot> {
  if (!editionId) throw new Error("Exact Organizer edition context is required.");
  const { data, error } = await (confirmationsSupabase as any).rpc(
    "studio2_confirmation_edition_snapshot",
    { p_edition_id: editionId },
  );
  if (error) throw new Error(errorMessage(error, "Could not load Confirmation edition authority."));
  return normalizeSnapshot(data);
}

export async function previewConfirmationEditionLinkRepair(
  editionId: string,
): Promise<ConfirmationEditionLinkPreview> {
  if (!editionId) throw new Error("Exact Organizer edition context is required.");
  const { data, error } = await (confirmationsSupabase as any).rpc(
    "studio2_confirmation_edition_link_preview",
    { p_edition_id: editionId },
  );
  if (error) throw new Error(errorMessage(error, "Could not review Confirmation edition binding."));
  normalizeSnapshot(data);
  return data as ConfirmationEditionLinkPreview;
}

export async function applyConfirmationEditionLinkRepair(
  preview: ConfirmationEditionLinkPreview,
): Promise<ConfirmationEditionOperationResult> {
  if (preview.blockers.length) throw new Error(preview.blockers[0]);
  const operationId = crypto.randomUUID();
  const idempotencyKey = `confirmation-edition-link:${preview.editionId}:${preview.stateVersion}`;
  return applyGovernedOperation(
    "studio2_apply_confirmation_edition_link_reconciliation",
    {
      p_edition_id: preview.editionId,
      p_operation_id: operationId,
      p_idempotency_key: idempotencyKey,
      p_expected_version: preview.stateVersion,
    },
    operationId,
    preview.editionId,
  );
}

export async function previewConfirmationEditionEditing(
  editionId: string,
  targetEnabled: boolean,
): Promise<ConfirmationEditionEditingPreview> {
  if (!editionId) throw new Error("Exact Organizer edition context is required.");
  const { data, error } = await (confirmationsSupabase as any).rpc(
    "studio2_confirmation_edition_editing_preview",
    { p_edition_id: editionId, p_target_enabled: targetEnabled },
  );
  if (error) throw new Error(errorMessage(error, "Could not review response-editing change."));
  normalizeSnapshot(data);
  return data as ConfirmationEditionEditingPreview;
}

export async function applyConfirmationEditionEditing(
  preview: ConfirmationEditionEditingPreview,
): Promise<ConfirmationEditionOperationResult> {
  if (preview.blockers.length) throw new Error(preview.blockers[0]);
  if (!preview.expectedRemoteId) throw new Error("Confirmation edition binding is missing.");

  const operationId = crypto.randomUUID();
  const idempotencyKey = [
    "confirmation-edition-editing",
    preview.editionId,
    preview.expectedRemoteId,
    preview.stateVersion,
    preview.targetEditingEnabled ? "open" : "closed",
  ].join(":");

  return applyGovernedOperation(
    "studio2_apply_confirmation_edition_editing",
    {
      p_edition_id: preview.editionId,
      p_expected_remote_id: preview.expectedRemoteId,
      p_target_enabled: preview.targetEditingEnabled,
      p_operation_id: operationId,
      p_idempotency_key: idempotencyKey,
      p_expected_version: preview.stateVersion,
    },
    operationId,
    preview.editionId,
  );
}
