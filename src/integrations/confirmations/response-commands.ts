import { confirmationsSupabase } from "@/integrations/confirmations/client";

export type ConfirmationResponseAccessPreview = {
  riskClass: "R2" | "R3";
  action: "access_update" | "token_issue" | "token_revoke" | "archive_or_delete";
  editionId: string;
  submissionId: string;
  country: string;
  roundId: string;
  roundName: string;
  expectedVersion: number;
  current: {
    editingAllowed: boolean;
    locked: boolean;
    adminNotesPresent: boolean;
    effectiveEditing: boolean;
  };
  activeTokenCount: number;
  tokens: Array<{
    id: string;
    tokenType: string;
    active: boolean;
    createdAt: string;
    expiresAt: string | null;
    lastUsedAt: string | null;
    useCount: number;
  }>;
  dependencies: {
    responseVersions: number;
    internalEntries: number;
    nationalFinals: number;
  };
  destructiveAllowed: boolean;
  preservationDecision: "retain_historical_response";
  blockers: string[];
  serverTime: string;
};

export type ConfirmationResponseCommandResult = {
  ok: boolean;
  riskClass: "R2" | "R3";
  action: string;
  editionId: string;
  submissionId: string;
  previousVersion: number;
  version: number;
  operationId: string;
  changed?: boolean;
};

export type ConfirmationTokenIssueResult = ConfirmationResponseCommandResult & {
  tokenId: string;
  tokenType: "one_time" | "reusable";
  expiresAt: string | null;
  token: string | null;
  secretAvailable: boolean;
  replayed?: boolean;
};

function requireId(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

export async function previewConfirmationResponseAction(input: {
  editionId: string;
  submissionId: string;
  action: ConfirmationResponseAccessPreview["action"];
  tokenId?: string | null;
}): Promise<ConfirmationResponseAccessPreview> {
  const editionId = requireId(input.editionId, "Organizer edition");
  const submissionId = requireId(input.submissionId, "Confirmation response");
  const { data, error } = await confirmationsSupabase.rpc(
    "studio2_confirmation_response_access_preview",
    {
      p_edition_id: editionId,
      p_submission_id: submissionId,
      p_action: input.action,
      p_token_id: input.tokenId ?? null,
    },
  );
  if (error) throw error;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Confirmation response preview returned invalid data.");
  }

  const preview = data as unknown as ConfirmationResponseAccessPreview;
  if (preview.editionId !== editionId || preview.submissionId !== submissionId) {
    throw new Error("Confirmation response preview returned a different Organizer scope.");
  }
  if (typeof preview.expectedVersion !== "number" || !Array.isArray(preview.blockers)) {
    throw new Error("Confirmation response preview is missing version or blocker evidence.");
  }
  return preview;
}

export async function applyConfirmationResponseAccess(input: {
  editionId: string;
  submissionId: string;
  editingAllowed: boolean;
  locked: boolean;
  adminNotes: string;
  operationId: string;
  idempotencyKey: string;
  expectedVersion: number;
}): Promise<ConfirmationResponseCommandResult> {
  const { data, error } = await confirmationsSupabase.rpc(
    "studio2_apply_confirmation_response_access",
    {
      p_edition_id: requireId(input.editionId, "Organizer edition"),
      p_submission_id: requireId(input.submissionId, "Confirmation response"),
      p_editing_allowed: input.editingAllowed,
      p_locked: input.locked,
      p_admin_notes: input.adminNotes,
      p_operation_id: requireId(input.operationId, "Operation id"),
      p_idempotency_key: requireId(input.idempotencyKey, "Idempotency key"),
      p_expected_version: input.expectedVersion,
    },
  );
  if (error) throw error;
  return data as unknown as ConfirmationResponseCommandResult;
}

export async function issueConfirmationEditToken(input: {
  editionId: string;
  submissionId: string;
  tokenType: "one_time" | "reusable";
  expiresInHours?: number | null;
  operationId: string;
  idempotencyKey: string;
  expectedVersion: number;
}): Promise<ConfirmationTokenIssueResult> {
  const { data, error } = await confirmationsSupabase.rpc(
    "studio2_issue_confirmation_edit_token",
    {
      p_edition_id: requireId(input.editionId, "Organizer edition"),
      p_submission_id: requireId(input.submissionId, "Confirmation response"),
      p_token_type: input.tokenType,
      p_expires_in_hours: input.expiresInHours ?? null,
      p_operation_id: requireId(input.operationId, "Operation id"),
      p_idempotency_key: requireId(input.idempotencyKey, "Idempotency key"),
      p_expected_version: input.expectedVersion,
    },
  );
  if (error) throw error;
  return data as unknown as ConfirmationTokenIssueResult;
}

export async function invalidateConfirmationEditToken(input: {
  editionId: string;
  submissionId: string;
  tokenId: string;
  operationId: string;
  idempotencyKey: string;
  expectedVersion: number;
}): Promise<ConfirmationResponseCommandResult> {
  const { data, error } = await confirmationsSupabase.rpc(
    "studio2_invalidate_confirmation_edit_token",
    {
      p_edition_id: requireId(input.editionId, "Organizer edition"),
      p_submission_id: requireId(input.submissionId, "Confirmation response"),
      p_token_id: requireId(input.tokenId, "Edit token"),
      p_operation_id: requireId(input.operationId, "Operation id"),
      p_idempotency_key: requireId(input.idempotencyKey, "Idempotency key"),
      p_expected_version: input.expectedVersion,
    },
  );
  if (error) throw error;
  return data as unknown as ConfirmationResponseCommandResult;
}
