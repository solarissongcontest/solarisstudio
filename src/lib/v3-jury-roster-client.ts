import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { createOrganisationCommand } from "@/lib/organisation-operation-contract";
import { normalizeSystemReceipt } from "@/lib/system-receipt";

const supabase = typedSupabase as any;

export type JuryRosterChangeKind = "materialize" | "add" | "update" | "reorder" | "remove";

export type JuryRosterDependencies = {
  scoreRows: number;
  ballotStatuses: number;
  ballotSubmissions: number;
};

export type JuryRosterPreviewVoter = {
  id: string;
  countryId: string | null;
  contestEntityId: string | null;
  name: string;
  kind: "country" | "external-country" | "organization" | "person" | "custom";
  flagImage: string | null;
  accentColor: string;
  sortOrder: number;
  dependencies: JuryRosterDependencies;
  canRemove: boolean;
};

export type JuryRosterMissingParticipant = {
  countryId: string | null;
  contestEntityId: string | null;
  name: string;
  flagImage: string | null;
  accentColor: string;
};

export type JuryRosterPreview = {
  editionId: string;
  showId: string;
  showName: string;
  expectedVersion: number;
  explicitRoster: boolean;
  roster: JuryRosterPreviewVoter[];
  missingParticipants: JuryRosterMissingParticipant[];
  missingParticipantCount: number;
  risk: {
    materialize: "R2";
    add: "R2";
    update: "R2";
    reorder: "R2";
    remove: "R3";
  };
  serverTime: string;
};

export type JuryRosterApplyResult = {
  ok: true;
  operationId: string;
  receiptId: string;
  editionId: string;
  showId: string;
  changeKind: JuryRosterChangeKind;
  voterId: string | null;
  createdCount: number;
  changedCount: number;
  version: number;
  rosterCount: number;
  serverTime: string;
  replayed: boolean;
};

export async function loadJuryRosterPreview(input: {
  editionId: string;
  showId: string;
}): Promise<JuryRosterPreview> {
  const response = await supabase.rpc("studio2_jury_roster_preview", {
    p_edition_id: input.editionId,
    p_show_id: input.showId,
  });
  if (response.error) throw response.error;
  if (!isPreview(response.data, input)) {
    throw new Error("Jury roster preview returned an invalid authoritative payload.");
  }
  return response.data;
}

export async function applyJuryRosterChange(input: {
  editionId: string;
  showId: string;
  changeKind: JuryRosterChangeKind;
  payload?: Record<string, unknown>;
  reason?: string | null;
  expectedVersion: number;
}): Promise<JuryRosterApplyResult> {
  const rawPayload = input.payload ?? {};
  const payload = normalizePayload(input.changeKind, rawPayload);
  const reason = input.reason?.trim() || null;
  if (input.changeKind === "remove" && !reason) {
    throw new Error("A removal reason is required.");
  }

  const voterId = typeof payload.voterId === "string" ? payload.voterId : null;
  const operation = createOrganisationCommand({
    command: `jury.roster.${input.changeKind}`,
    payload: {
      editionId: input.editionId,
      showId: input.showId,
      changeKind: input.changeKind,
      payload,
      reason,
      expectedVersion: input.expectedVersion,
    },
    riskClass: input.changeKind === "remove" ? "R3" : "R2",
    scope: {
      editionId: input.editionId,
      showId: input.showId,
      entityId: voterId,
    },
    expectedVersion: input.expectedVersion,
    reason,
  });

  const mutation = await supabase.rpc("studio2_apply_jury_roster_change", {
    p_edition_id: input.editionId,
    p_show_id: input.showId,
    p_change_kind: input.changeKind,
    p_payload: payload,
    p_reason: reason,
    p_operation_id: operation.operationId,
    p_idempotency_key: operation.idempotencyKey,
    p_expected_version: input.expectedVersion,
  });

  if (!mutation.error) {
    if (!isApplyResult(mutation.data, input, operation.operationId)) {
      throw new Error("Jury roster command returned an invalid authoritative result.");
    }
    return mutation.data;
  }

  // A transport failure can occur after the database committed. Reconcile the
  // immutable operation once; never blindly issue the mutation again.
  const reconciliation = await supabase.rpc("studio2_reconcile_operation", {
    p_operation_id: operation.operationId,
  });
  if (!reconciliation.error) {
    const receipt = normalizeSystemReceipt(reconciliation.data);
    if (
      receipt?.operationId === operation.operationId &&
      receipt.status === "succeeded" &&
      isApplyResult(receipt.result, input, operation.operationId)
    ) {
      return { ...receipt.result, replayed: true };
    }
  }

  throw mutation.error;
}

function normalizePayload(
  changeKind: JuryRosterChangeKind,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (changeKind !== "reorder") return payload;
  const voterIds = Array.isArray(payload.voterIds)
    ? payload.voterIds
    : Array.isArray(payload.orderedVoterIds)
      ? payload.orderedVoterIds
      : null;
  return voterIds ? { orderedVoterIds: voterIds } : payload;
}

function isPreview(
  value: unknown,
  input: { editionId: string; showId: string },
): value is JuryRosterPreview {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const preview = value as Partial<JuryRosterPreview>;
  return (
    preview.editionId === input.editionId &&
    preview.showId === input.showId &&
    Number.isSafeInteger(preview.expectedVersion) &&
    (preview.expectedVersion ?? 0) >= 1 &&
    typeof preview.explicitRoster === "boolean" &&
    Array.isArray(preview.roster) &&
    Array.isArray(preview.missingParticipants) &&
    Number.isSafeInteger(preview.missingParticipantCount) &&
    (preview.missingParticipantCount ?? -1) >= 0 &&
    typeof preview.serverTime === "string"
  );
}

function isApplyResult(
  value: unknown,
  input: {
    editionId: string;
    showId: string;
    changeKind: JuryRosterChangeKind;
  },
  operationId: string,
): value is JuryRosterApplyResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Partial<JuryRosterApplyResult>;
  return (
    result.ok === true &&
    result.operationId === operationId &&
    result.editionId === input.editionId &&
    result.showId === input.showId &&
    result.changeKind === input.changeKind &&
    Number.isSafeInteger(result.version) &&
    (result.version ?? 0) >= 1 &&
    Number.isSafeInteger(result.rosterCount) &&
    (result.rosterCount ?? -1) >= 0 &&
    typeof result.serverTime === "string"
  );
}
