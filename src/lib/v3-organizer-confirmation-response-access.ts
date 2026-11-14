import { confirmationsSupabase } from "@/integrations/confirmations/client";
import { createOrganisationCommand } from "@/lib/organisation-operation-contract";
import { systemErrorCodeFromUnknown, toSystemError } from "@/lib/system-error";

export type ConfirmationResponseAccessChangeKind =
  | "update_access"
  | "issue_recovery"
  | "invalidate_recovery"
  | "delete_response";

export type ConfirmationResponseRecoveryToken = {
  id: string;
  tokenType: "one_time" | "reusable" | string;
  active: boolean;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  useCount: number;
};

export type ConfirmationResponseAccessPreview = {
  editionId: string;
  submissionId: string;
  roundId: string;
  country: string;
  expectedVersion: number;
  state: {
    editingAllowed: boolean;
    locked: boolean;
    adminNotes: string | null;
    reviewed: boolean;
    editCount: number;
    roundStatus: string;
    roundEditingEnabled: boolean;
    editionEditingEnabled: boolean;
  };
  recoveryTokens: ConfirmationResponseRecoveryToken[];
  delete: {
    allowed: boolean;
    riskClass: "R3";
    dependencies: Record<string, number>;
    policy: string;
  };
  risk: {
    accessUpdate: "R2";
    recoveryIssue: "R2";
    recoveryInvalidate: "R2";
    permanentDelete: "R3";
  };
  serverTime: string;
};

export type ConfirmationResponseAccessResult = {
  ok: true;
  operationId: string;
  receiptId: string;
  editionId: string;
  submissionId: string;
  changeKind: ConfirmationResponseAccessChangeKind;
  version: number;
  changed?: boolean;
  editingAllowed?: boolean;
  locked?: boolean;
  revokedEditTokens?: number;
  tokenId?: string;
  tokenType?: string;
  expiresAt?: string | null;
  token?: string;
  secretAvailable?: boolean;
  deleted?: boolean;
  replayed?: boolean;
  serverTime: string;
};

type ReviewedCommand = ReturnType<typeof createOrganisationCommand>;

type PendingReviewedCommand = {
  command: ReviewedCommand;
  editionId: string;
  submissionId: string;
  changeKind: ConfirmationResponseAccessChangeKind;
};

const pendingCommandByFingerprint = new Map<string, PendingReviewedCommand>();
const pendingFingerprintByOperation = new Map<string, string>();

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${label}.`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) throw new Error(`Invalid ${label}.`);
  return value;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function requiredBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`Invalid ${label}.`);
  return value;
}

function requiredNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Invalid ${label}.`);
  return value;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function requiredRisk<T extends "R2" | "R3">(
  value: unknown,
  expected: T,
  label: string,
): T {
  if (requiredString(value, label) !== expected) throw new Error(`Invalid ${label}.`);
  return expected;
}

function parseDependencies(value: unknown): Record<string, number> {
  const source = record(value, "delete dependency evidence");
  return Object.fromEntries(
    Object.entries(source).map(([key, count]) => [
      key,
      requiredNumber(count, `delete dependency ${key}`),
    ]),
  );
}

function canonicalizeCommandValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeCommandValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalizeCommandValue(item)]),
    );
  }
  return value;
}

function reviewedCommandFingerprint({
  preview,
  changeKind,
  payload,
  reason,
}: {
  preview: ConfirmationResponseAccessPreview;
  changeKind: ConfirmationResponseAccessChangeKind;
  payload: Record<string, unknown>;
  reason?: string | null;
}) {
  return JSON.stringify(
    canonicalizeCommandValue({
      editionId: preview.editionId,
      submissionId: preview.submissionId,
      expectedVersion: preview.expectedVersion,
      changeKind,
      payload,
      reason: reason?.trim() || null,
    }),
  );
}

function forgetPendingCommand(operationId: string) {
  const fingerprint = pendingFingerprintByOperation.get(operationId);
  if (!fingerprint) return;
  pendingFingerprintByOperation.delete(operationId);
  pendingCommandByFingerprint.delete(fingerprint);
}

function rememberPendingCommand(
  fingerprint: string,
  pending: PendingReviewedCommand,
) {
  // One UI action of a given kind may be unresolved at a time. If authoritative
  // preview/version or reviewed semantics changed, the old operation is no longer
  // the operation for the new review and must not be reused accidentally.
  for (const [existingFingerprint, existing] of pendingCommandByFingerprint.entries()) {
    if (
      existing.editionId === pending.editionId &&
      existing.submissionId === pending.submissionId &&
      existing.changeKind === pending.changeKind &&
      existingFingerprint !== fingerprint
    ) {
      pendingCommandByFingerprint.delete(existingFingerprint);
      pendingFingerprintByOperation.delete(existing.command.operationId);
    }
  }
  pendingCommandByFingerprint.set(fingerprint, pending);
  pendingFingerprintByOperation.set(pending.command.operationId, fingerprint);
}

export function confirmationResponseAccessErrorMessage(
  error: unknown,
  fallback = "The Confirmation response operation could not be completed.",
) {
  if (systemErrorCodeFromUnknown(error)) return toSystemError(error).message;
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export function parseConfirmationResponseAccessPreview(
  value: unknown,
): ConfirmationResponseAccessPreview {
  const root = record(value, "Confirmation response access preview");
  const state = record(root.state, "Confirmation response state");
  const deletion = record(root.delete, "Confirmation response delete review");
  const risk = record(root.risk, "Confirmation response risk model");
  const tokens = Array.isArray(root.recoveryTokens) ? root.recoveryTokens : [];
  const expectedVersion = requiredNumber(root.expectedVersion, "Confirmation response version");
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw new Error("Invalid Confirmation response version.");
  }

  const preview: ConfirmationResponseAccessPreview = {
    editionId: requiredString(root.editionId, "Confirmation edition"),
    submissionId: requiredString(root.submissionId, "Confirmation submission"),
    roundId: requiredString(root.roundId, "Confirmation round"),
    country: requiredString(root.country, "Confirmation country"),
    expectedVersion,
    state: {
      editingAllowed: requiredBoolean(state.editingAllowed, "editing state"),
      locked: requiredBoolean(state.locked, "lock state"),
      adminNotes: optionalString(state.adminNotes),
      reviewed: requiredBoolean(state.reviewed, "review state"),
      editCount: requiredNumber(state.editCount, "edit count"),
      roundStatus: requiredString(state.roundStatus, "round status"),
      roundEditingEnabled: requiredBoolean(state.roundEditingEnabled, "round editing state"),
      editionEditingEnabled: requiredBoolean(state.editionEditingEnabled, "edition editing state"),
    },
    recoveryTokens: tokens.map((raw) => {
      const token = record(raw, "recovery token");
      return {
        id: requiredString(token.id, "recovery token id"),
        tokenType: requiredString(token.tokenType, "recovery token type"),
        active: requiredBoolean(token.active, "recovery token state"),
        createdAt: requiredString(token.createdAt, "recovery token creation time"),
        expiresAt: optionalString(token.expiresAt),
        lastUsedAt: optionalString(token.lastUsedAt),
        useCount: requiredNumber(token.useCount, "recovery token use count"),
      };
    }),
    delete: {
      allowed: requiredBoolean(deletion.allowed, "delete eligibility"),
      riskClass: requiredRisk(deletion.riskClass, "R3", "delete risk class"),
      dependencies: parseDependencies(deletion.dependencies),
      policy: requiredString(deletion.policy, "delete policy"),
    },
    risk: {
      accessUpdate: requiredRisk(risk.accessUpdate, "R2", "access risk"),
      recoveryIssue: requiredRisk(risk.recoveryIssue, "R2", "recovery issue risk"),
      recoveryInvalidate: requiredRisk(
        risk.recoveryInvalidate,
        "R2",
        "recovery invalidate risk",
      ),
      permanentDelete: requiredRisk(risk.permanentDelete, "R3", "delete risk"),
    },
    serverTime: requiredString(root.serverTime, "server time"),
  };

  if (preview.state.editingAllowed && preview.state.locked) {
    throw new Error("Invalid Confirmation response state: editing cannot be open while locked.");
  }
  return preview;
}

export function assertConfirmationResponseAccessScope(
  preview: ConfirmationResponseAccessPreview,
  editionId: string,
  submissionId: string,
) {
  if (preview.editionId !== editionId || preview.submissionId !== submissionId) {
    throw new Error("Confirmation response scope changed. Reload before continuing.");
  }
}

export async function previewConfirmationResponseAccess(
  editionId: string,
  submissionId: string,
) {
  const { data, error } = await confirmationsSupabase.rpc(
    "studio2_confirmation_response_access_preview",
    {
      p_edition_id: editionId,
      p_submission_id: submissionId,
    },
  );
  if (error) throw error;
  const preview = parseConfirmationResponseAccessPreview(data);
  assertConfirmationResponseAccessScope(preview, editionId, submissionId);
  return preview;
}

export function createConfirmationResponseAccessCommand({
  preview,
  changeKind,
  payload,
  reason,
}: {
  preview: ConfirmationResponseAccessPreview;
  changeKind: ConfirmationResponseAccessChangeKind;
  payload: Record<string, unknown>;
  reason?: string | null;
}) {
  const fingerprint = reviewedCommandFingerprint({ preview, changeKind, payload, reason });
  const pending = pendingCommandByFingerprint.get(fingerprint);
  if (pending) return pending.command;

  const command =
    changeKind === "update_access"
      ? "confirmation.response.access.update"
      : changeKind === "issue_recovery"
        ? "confirmation.response.recovery.issue"
        : changeKind === "invalidate_recovery"
          ? "confirmation.response.recovery.invalidate"
          : "confirmation.response.delete";

  const reviewedCommand = createOrganisationCommand({
    command,
    riskClass: changeKind === "delete_response" ? "R3" : "R2",
    scope: { editionId: preview.editionId, entityId: preview.submissionId },
    payload: {
      changeKind,
      ...payload,
      reviewedResponseVersion: preview.expectedVersion,
    },
    reason: reason?.trim() || null,
    expectedVersion: preview.expectedVersion,
  });

  rememberPendingCommand(fingerprint, {
    command: reviewedCommand,
    editionId: preview.editionId,
    submissionId: preview.submissionId,
    changeKind,
  });
  return reviewedCommand;
}

export function parseConfirmationResponseAccessResult(
  value: unknown,
  expected: {
    editionId: string;
    submissionId: string;
    changeKind: ConfirmationResponseAccessChangeKind;
    operationId: string;
  },
): ConfirmationResponseAccessResult {
  const root = record(value, "Confirmation response access result");
  if (root.ok !== true) throw new Error("Confirmation response operation did not succeed.");
  const operationId = requiredString(root.operationId, "operation id");
  const receiptId = requiredString(root.receiptId, "receipt id");
  const editionId = requiredString(root.editionId, "edition id");
  const submissionId = requiredString(root.submissionId, "submission id");
  const changeKind = requiredString(
    root.changeKind,
    "change kind",
  ) as ConfirmationResponseAccessChangeKind;
  const version = requiredNumber(root.version, "response version");

  if (
    operationId !== expected.operationId ||
    editionId !== expected.editionId ||
    submissionId !== expected.submissionId ||
    changeKind !== expected.changeKind
  ) {
    throw new Error("Confirmation response receipt did not match the reviewed operation.");
  }

  return {
    ok: true,
    operationId,
    receiptId,
    editionId,
    submissionId,
    changeKind,
    version,
    changed: typeof root.changed === "boolean" ? root.changed : undefined,
    editingAllowed: typeof root.editingAllowed === "boolean" ? root.editingAllowed : undefined,
    locked: typeof root.locked === "boolean" ? root.locked : undefined,
    revokedEditTokens: optionalNumber(root.revokedEditTokens),
    tokenId: optionalString(root.tokenId) ?? undefined,
    tokenType: optionalString(root.tokenType) ?? undefined,
    expiresAt: optionalString(root.expiresAt),
    token: optionalString(root.token) ?? undefined,
    secretAvailable:
      typeof root.secretAvailable === "boolean" ? root.secretAvailable : undefined,
    deleted: typeof root.deleted === "boolean" ? root.deleted : undefined,
    replayed: typeof root.replayed === "boolean" ? root.replayed : undefined,
    serverTime: requiredString(root.serverTime, "server time"),
  };
}

export async function applyConfirmationResponseAccessChange({
  preview,
  changeKind,
  payload,
  reason,
  operationId,
  idempotencyKey,
}: {
  preview: ConfirmationResponseAccessPreview;
  changeKind: ConfirmationResponseAccessChangeKind;
  payload: Record<string, unknown>;
  reason?: string | null;
  operationId: string;
  idempotencyKey: string;
}) {
  const { data, error } = await confirmationsSupabase.rpc(
    "studio2_apply_confirmation_response_access_change",
    {
      p_edition_id: preview.editionId,
      p_submission_id: preview.submissionId,
      p_change_kind: changeKind,
      p_payload: payload,
      p_reason: reason?.trim() || null,
      p_operation_id: operationId,
      p_idempotency_key: idempotencyKey,
      p_expected_version: preview.expectedVersion,
    },
  );
  if (error) throw error;
  const result = parseConfirmationResponseAccessResult(data, {
    editionId: preview.editionId,
    submissionId: preview.submissionId,
    changeKind,
    operationId,
  });
  forgetPendingCommand(operationId);
  return result;
}

export async function reauthenticateConfirmationResponseR3(password: string) {
  if (!password) throw new Error("Enter your current Solaris password for this R3 deletion.");
  const { data: current, error: currentError } = await confirmationsSupabase.auth.getUser();
  if (currentError) throw currentError;
  const user = current.user;
  if (!user?.id || !user.email) {
    throw new Error("This Organizer account cannot be reauthenticated with a password.");
  }

  const originalUserId = user.id;
  const { data, error } = await confirmationsSupabase.auth.signInWithPassword({
    email: user.email,
    password,
  });
  if (error) throw error;
  if (!data.user?.id || data.user.id !== originalUserId) {
    throw new Error("Fresh authentication resolved a different Solaris account. Nothing was changed.");
  }
}
