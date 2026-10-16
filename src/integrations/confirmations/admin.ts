import { confirmationsSupabase } from "@/integrations/confirmations/client";
import { hasSolarisOrganizerAccess } from "@/integrations/supabase/access";
import { supabase as solarisSupabase } from "@/integrations/supabase/client";

export type ConfirmationRound = {
  id: string;
  edition_id: string;
  name: string;
  status: "draft" | "open" | "closed" | "auto_closed";
  editing_enabled: boolean;
  opens_at: string | null;
  closes_at: string | null;
  response_limit: number | null;
  response_count: number;
  created_at: string;
};

export type ConfirmationRoundChangeKind =
  | "create"
  | "update"
  | "status"
  | "editing"
  | "delete";

export type ConfirmationRoundChangePayload = {
  editionId?: string;
  name?: string;
  status?: "open" | "closed";
  opensAt?: string | null;
  closesAt?: string | null;
  responseLimit?: number | null;
  editingEnabled?: boolean;
  enabled?: boolean;
};

export type ConfirmationRoundChangePreview = {
  riskClass: "R2" | "R3";
  changeKind: ConfirmationRoundChangeKind;
  roundId: string | null;
  roundName: string | null;
  editionId: string;
  expectedVersion: number;
  responseCount: number;
  affectedResponses: number;
  currentlyEditableResponses?: number;
  unresolvedRequirementCount: number;
  currentStatus?: ConfirmationRound["status"];
  targetStatus?: ConfirmationRound["status"];
  currentEditingEnabled?: boolean;
  targetEditingEnabled?: boolean;
  willMoveOpeningTimeToNow: boolean;
  willClearExpiredClosingTime: boolean;
  requirementsCreated: number;
  alreadyApplied: boolean;
  blockers: string[];
};

export type ConfirmationRoundChangeReceipt = {
  ok: true;
  riskClass: "R2" | "R3";
  changeKind: ConfirmationRoundChangeKind;
  roundId: string;
  status: ConfirmationRound["status"] | null;
  editingEnabled: boolean | null;
  affectedResponses: number;
  requirementsCreated: number;
  previousVersion: number;
  version: number;
  operationId: string;
};

type ConfirmationRoundPreviewInput = {
  roundId?: string | null;
  kind: ConfirmationRoundChangeKind;
  payload?: ConfirmationRoundChangePayload;
};

type ConfirmationRoundApplyInput = {
  roundId?: string | null;
  kind: ConfirmationRoundChangeKind;
  payload?: ConfirmationRoundChangePayload;
  operationId: string;
  idempotencyKey: string;
  expectedVersion: number;
};

export type ConfirmationEdition = {
  id: string;
  name: string;
  edition_number: number;
  description: string | null;
  status: "draft" | "active" | "finished";
  editing_enabled: boolean;
  created_at: string;
  response_count: number;
  rounds: ConfirmationRound[];
};

export type ConfirmationCalendarRow = {
  id: string;
  country: string;
  participating: boolean;
  selection_method: string | null;
  reveal_date_type: string | null;
  reveal_exact_date: string | null;
  reveal_approximate_text: string | null;
  nf_date_type: string | null;
  nf_exact_date: string | null;
  nf_approximate_text: string | null;
  nf_result_date_type: string | null;
  nf_result_exact_date: string | null;
  nf_result_approximate_text: string | null;
  edition_id: string;
  round_id: string;
  edition_name: string | null;
  edition_number: number | null;
  round_name: string | null;
  nf_name: string | null;
};

export type ConfirmationRecoveryCode = {
  id: string;
  country: string;
  instagram_username: string;
  recovery_code: string | null;
  submitted_at: string;
  round_id: string;
  round_name: string;
  edition_id: string;
  edition_name: string;
  edition_number: number;
};

export type ConfirmationRequirement = {
  id: string;
  editionId: string;
  countryId: string;
  countryName: string;
  countryCode: string;
  generation: number;
  status: "required" | "satisfied" | "waived" | "invalidated";
  reason: string;
  validFrom: string;
  resolvedBySubmissionId: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function requireConfirmationsAdmin() {
  const { data: userData, error: userError } = await solarisSupabase.auth.getUser();
  if (userError) throw userError;

  const user = userData.user;
  if (!user) return null;

  return (await hasSolarisOrganizerAccess(user.id)) ? user : null;
}

export async function loadConfirmationEditions(): Promise<ConfirmationEdition[]> {
  const { data, error } = await confirmationsSupabase.rpc("admin_confirmation_editions");
  if (error) throw error;
  return Array.isArray(data) ? (data as unknown as ConfirmationEdition[]) : [];
}

export async function saveConfirmationEdition(payload: {
  id?: string;
  name: string;
  edition_number: number;
  description?: string;
  status: ConfirmationEdition["status"];
  editing_enabled: boolean;
}) {
  const { data, error } = await confirmationsSupabase.rpc("admin_confirmation_save_edition", {
    _payload: payload,
  });
  if (error) throw error;
  return data as string;
}

export async function deleteConfirmationEdition(id: string) {
  const { data, error } = await confirmationsSupabase.rpc("admin_confirmation_delete_edition", {
    _id: id,
  });
  if (error) throw error;
  return data === true;
}

export async function setConfirmationEditionEditing(id: string, enabled: boolean) {
  const { data, error } = await confirmationsSupabase.rpc("admin_confirmation_set_edition_editing", {
    _id: id,
    _enabled: enabled,
  });
  if (error) throw error;
  return data === true;
}

export async function saveConfirmationRound(payload: {
  id?: string;
  edition_id: string;
  name: string;
  status: ConfirmationRound["status"];
  opens_at: string | null;
  closes_at: string | null;
  response_limit: number | null;
  editing_enabled: boolean;
}) {
  const { data, error } = await confirmationsSupabase.rpc("admin_confirmation_save_round", {
    _payload: payload,
  });
  if (error) throw error;
  return data as string;
}

export async function deleteConfirmationRound(id: string) {
  const { data, error } = await confirmationsSupabase.rpc("admin_confirmation_delete_round", {
    _id: id,
  });
  if (error) throw error;
  return data === true;
}

export async function setConfirmationRoundStatus(
  id: string,
  status: ConfirmationRound["status"],
) {
  const { data, error } = await confirmationsSupabase.rpc("admin_confirmation_set_round_status", {
    _id: id,
    _status: status,
  });
  if (error) throw error;
  return data === true;
}

export async function setConfirmationRoundEditing(id: string, enabled: boolean) {
  const { data, error } = await confirmationsSupabase.rpc("admin_confirmation_set_round_editing", {
    _id: id,
    _enabled: enabled,
  });
  if (error) throw error;
  return data === true;
}

function isRoundStatus(value: unknown): value is ConfirmationRound["status"] {
  return ["draft", "open", "closed", "auto_closed"].includes(String(value));
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function validateConfirmationRoundChangePreview(
  value: unknown,
  input: ConfirmationRoundPreviewInput,
): ConfirmationRoundChangePreview {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Confirmation round preview returned an invalid payload.");
  }

  const preview = value as Partial<ConfirmationRoundChangePreview>;
  const validShape =
    (preview.riskClass === "R2" || preview.riskClass === "R3") &&
    ["create", "update", "status", "editing", "delete"].includes(preview.changeKind ?? "") &&
    (preview.roundId === null || (typeof preview.roundId === "string" && Boolean(preview.roundId.trim()))) &&
    (preview.roundName === null || typeof preview.roundName === "string") &&
    typeof preview.editionId === "string" &&
    Boolean(preview.editionId.trim()) &&
    isNonNegativeInteger(preview.expectedVersion) &&
    isNonNegativeInteger(preview.responseCount) &&
    isNonNegativeInteger(preview.affectedResponses) &&
    (preview.currentlyEditableResponses === undefined || isNonNegativeInteger(preview.currentlyEditableResponses)) &&
    isNonNegativeInteger(preview.unresolvedRequirementCount) &&
    (preview.currentStatus === undefined || isRoundStatus(preview.currentStatus)) &&
    (preview.targetStatus === undefined || isRoundStatus(preview.targetStatus)) &&
    (preview.currentEditingEnabled === undefined || typeof preview.currentEditingEnabled === "boolean") &&
    (preview.targetEditingEnabled === undefined || typeof preview.targetEditingEnabled === "boolean") &&
    typeof preview.willMoveOpeningTimeToNow === "boolean" &&
    typeof preview.willClearExpiredClosingTime === "boolean" &&
    isNonNegativeInteger(preview.requirementsCreated) &&
    typeof preview.alreadyApplied === "boolean" &&
    isStringArray(preview.blockers);

  if (!validShape) {
    throw new Error("Confirmation round preview returned an invalid payload.");
  }
  if (preview.changeKind !== input.kind) {
    throw new Error("Confirmation round preview returned a different change kind.");
  }
  if (input.roundId && preview.roundId !== input.roundId) {
    throw new Error("Confirmation round preview returned a different round.");
  }
  if (input.kind === "create" && preview.roundId !== null) {
    throw new Error("Confirmation round create preview unexpectedly returned an existing round.");
  }
  const payloadEditionId = input.payload?.editionId?.trim();
  if (payloadEditionId && preview.editionId !== payloadEditionId) {
    throw new Error("Confirmation round preview returned data outside the requested edition scope.");
  }
  if (preview.requirementsCreated !== 0) {
    throw new Error("Confirmation round preview unexpectedly creates confirmation requirements.");
  }

  return preview as ConfirmationRoundChangePreview;
}

export async function previewConfirmationRoundChange(
  input: ConfirmationRoundPreviewInput,
): Promise<ConfirmationRoundChangePreview> {
  const { data, error } = await confirmationsSupabase.rpc(
    "studio2_confirmation_round_change_preview",
    {
      p_round_id: input.roundId ?? null,
      p_change_kind: input.kind,
      p_payload: input.payload ?? {},
    },
  );
  if (error) throw error;
  return validateConfirmationRoundChangePreview(data, input);
}

export function validateConfirmationRoundChangeReceipt(
  value: unknown,
  input: Pick<
    ConfirmationRoundApplyInput,
    "roundId" | "kind" | "operationId" | "expectedVersion"
  >,
): ConfirmationRoundChangeReceipt {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Confirmation round command returned an invalid receipt.");
  }

  const receipt = value as Partial<ConfirmationRoundChangeReceipt>;
  const validShape =
    receipt.ok === true &&
    (receipt.riskClass === "R2" || receipt.riskClass === "R3") &&
    ["create", "update", "status", "editing", "delete"].includes(receipt.changeKind ?? "") &&
    typeof receipt.roundId === "string" &&
    Boolean(receipt.roundId.trim()) &&
    (receipt.status === null || isRoundStatus(receipt.status)) &&
    (receipt.editingEnabled === null || typeof receipt.editingEnabled === "boolean") &&
    isNonNegativeInteger(receipt.affectedResponses) &&
    isNonNegativeInteger(receipt.requirementsCreated) &&
    isNonNegativeInteger(receipt.previousVersion) &&
    isNonNegativeInteger(receipt.version) &&
    typeof receipt.operationId === "string" &&
    Boolean(receipt.operationId.trim());

  if (!validShape) {
    throw new Error("Confirmation round command returned an invalid receipt.");
  }
  if (receipt.operationId !== input.operationId) {
    throw new Error("Confirmation round command returned a receipt for a different operation.");
  }
  if (receipt.changeKind !== input.kind) {
    throw new Error("Confirmation round command returned a receipt for a different change kind.");
  }
  if (input.roundId && receipt.roundId !== input.roundId) {
    throw new Error("Confirmation round command returned a receipt for a different round.");
  }
  if (receipt.previousVersion !== input.expectedVersion || receipt.version < receipt.previousVersion) {
    throw new Error("Confirmation round command returned inconsistent version evidence.");
  }
  if (receipt.requirementsCreated !== 0) {
    throw new Error("Confirmation round change unexpectedly created confirmation requirements.");
  }

  return receipt as ConfirmationRoundChangeReceipt;
}

export async function applyConfirmationRoundChange(
  input: ConfirmationRoundApplyInput,
): Promise<ConfirmationRoundChangeReceipt> {
  const { data, error } = await confirmationsSupabase.rpc(
    "studio2_apply_confirmation_round_change",
    {
      p_round_id: input.roundId ?? null,
      p_change_kind: input.kind,
      p_payload: input.payload ?? {},
      p_operation_id: input.operationId,
      p_idempotency_key: input.idempotencyKey,
      p_expected_version: input.expectedVersion,
    },
  );
  if (error) throw error;
  return validateConfirmationRoundChangeReceipt(data, input);
}

export async function loadConfirmationCalendar(
  editionId?: string,
  roundId?: string,
): Promise<ConfirmationCalendarRow[]> {
  const { data, error } = await confirmationsSupabase.rpc("admin_confirmation_calendar", {
    _edition_id: editionId || null,
    _round_id: roundId || null,
  });
  if (error) throw error;
  return Array.isArray(data) ? (data as unknown as ConfirmationCalendarRow[]) : [];
}

export async function loadConfirmationRequirements(
  editionId: string,
): Promise<ConfirmationRequirement[]> {
  const { data, error } = await confirmationsSupabase.rpc("admin_confirmation_requirements", {
    p_edition_id: editionId,
  });
  if (error) throw error;
  return Array.isArray(data) ? (data as unknown as ConfirmationRequirement[]) : [];
}

export async function ensureConfirmationRequirements(
  editionId: string,
  countryIds?: string[],
) {
  const { data, error } = await confirmationsSupabase.rpc(
    "admin_confirmation_ensure_requirements",
    {
      p_edition_id: editionId,
      p_country_ids: countryIds?.length ? countryIds : null,
    },
  );
  if (error) throw error;
  return data as { ok: boolean; editionId: string; created: number };
}

export async function reconfirmConfirmationRequirement(input: {
  requirementId: string;
  reason: string;
  operationId: string;
  idempotencyKey: string;
}) {
  const { data, error } = await confirmationsSupabase.rpc(
    "admin_confirmation_reconfirm",
    {
      p_requirement_id: input.requirementId,
      p_reason: input.reason,
      p_operation_id: input.operationId,
      p_idempotency_key: input.idempotencyKey,
    },
  );
  if (error) throw error;
  return data as {
    ok: boolean;
    operationId: string;
    previousRequirementId: string;
    requirementId: string;
    generation: number;
  };
}

export async function waiveConfirmationRequirement(input: {
  requirementId: string;
  reason: string;
  operationId: string;
  idempotencyKey: string;
}) {
  const { data, error } = await confirmationsSupabase.rpc(
    "admin_confirmation_waive_requirement",
    {
      p_requirement_id: input.requirementId,
      p_reason: input.reason,
      p_operation_id: input.operationId,
      p_idempotency_key: input.idempotencyKey,
    },
  );
  if (error) throw error;
  return data as {
    ok: boolean;
    operationId: string;
    requirementId: string;
    status: "waived";
  };
}

export async function loadConfirmationRecoveryCodes(): Promise<ConfirmationRecoveryCode[]> {
  const { data, error } = await confirmationsSupabase.rpc("admin_confirmation_recovery_codes");
  if (error) throw error;
  return Array.isArray(data) ? (data as unknown as ConfirmationRecoveryCode[]) : [];
}
