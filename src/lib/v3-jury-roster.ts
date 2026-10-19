import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { createOrganisationCommand } from "@/lib/organisation-operation-contract";
import { normalizeSystemReceipt } from "@/lib/system-receipt";
import type { SystemJsonValue, SystemReceipt } from "@/lib/system-operation-contract";

const supabase = typedSupabase as any;

export type JuryRosterAction = "materialize" | "add" | "edit" | "reorder" | "remove";

export type JuryRosterEvidence = {
  voterId: string;
  savedVoteRows: number;
  ballotSubmissions: number;
  dnvRows: number;
  hasEvidence: boolean;
};

export type JuryRosterVoter = {
  id: string;
  editionId: string;
  showId: string | null;
  countryId: string | null;
  contestEntityId: string | null;
  name: string;
  kind: "country" | "external-country" | "organization" | "person" | "custom";
  flagImage: string | null;
  accentColor: string;
  sortOrder: number;
};

export type JuryRosterPreview = {
  riskClass: "R2";
  editionId: string;
  showId: string;
  showName: string;
  action: JuryRosterAction;
  voterId: string | null;
  expectedVersion: number;
  rosterCount: number;
  missingParticipants: number;
  evidence: JuryRosterEvidence | null;
  blocked: boolean;
  roster: JuryRosterVoter[];
  serverTime: string;
};

export type JuryRosterMutationInput = {
  editionId: string;
  showId: string;
  action: JuryRosterAction;
  voterId?: string | null;
  payload?: Record<string, unknown>;
  reason?: string | null;
};

export type ApplyJuryRosterMutationInput = JuryRosterMutationInput & {
  expectedVersion: number;
};

export async function previewJuryRosterMutationV3(
  input: JuryRosterMutationInput,
): Promise<JuryRosterPreview> {
  const response = await supabase.rpc("studio2_jury_roster_preview_v3", {
    p_edition_id: input.editionId,
    p_show_id: input.showId,
    p_action: input.action,
    p_voter_id: input.voterId ?? null,
    p_payload: input.payload ?? {},
  });
  if (response.error) throw response.error;
  if (!isJuryRosterPreview(response.data, input)) {
    throw new Error("Jury roster preflight returned an invalid authoritative payload.");
  }
  return response.data;
}

/**
 * Commit one reviewed Jury-roster mutation through the canonical System V3
 * operation boundary. Transport uncertainty is reconciled by immutable
 * operation id; the mutation is never blindly retried.
 */
export async function applyJuryRosterMutationV3(
  input: ApplyJuryRosterMutationInput,
): Promise<SystemReceipt<SystemJsonValue>> {
  const reason = input.reason?.trim() || null;
  const command = createOrganisationCommand({
    command: `jury.roster.${input.action}`,
    riskClass: "R2",
    scope: {
      editionId: input.editionId,
      showId: input.showId,
      entityId: input.voterId ?? null,
    },
    expectedVersion: input.expectedVersion,
    reason,
    payload: {
      editionId: input.editionId,
      showId: input.showId,
      action: input.action,
      voterId: input.voterId ?? null,
      payload: input.payload ?? {},
      reason,
      expectedVersion: input.expectedVersion,
    },
  });

  const mutation = await supabase.rpc("studio2_apply_jury_roster_v3", {
    p_edition_id: input.editionId,
    p_show_id: input.showId,
    p_action: input.action,
    p_voter_id: input.voterId ?? null,
    p_payload: input.payload ?? {},
    p_reason: reason,
    p_expected_version: input.expectedVersion,
    p_operation_id: command.operationId,
    p_idempotency_key: command.idempotencyKey,
    p_correlation_id: command.correlationId,
  });

  if (!mutation.error) {
    const receipt = normalizeSystemReceipt(mutation.data);
    if (!receipt || receipt.operationId !== command.operationId || receipt.status !== "succeeded") {
      throw new Error("Jury roster command returned an invalid operation receipt.");
    }
    return receipt;
  }

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

function isJuryRosterPreview(
  value: unknown,
  input: JuryRosterMutationInput,
): value is JuryRosterPreview {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const preview = value as Partial<JuryRosterPreview>;
  return (
    preview.riskClass === "R2" &&
    preview.editionId === input.editionId &&
    preview.showId === input.showId &&
    preview.action === input.action &&
    Number.isSafeInteger(preview.expectedVersion) &&
    (preview.expectedVersion ?? -1) >= 0 &&
    Number.isSafeInteger(preview.rosterCount) &&
    (preview.rosterCount ?? -1) >= 0 &&
    Number.isSafeInteger(preview.missingParticipants) &&
    (preview.missingParticipants ?? -1) >= 0 &&
    typeof preview.blocked === "boolean" &&
    Array.isArray(preview.roster) &&
    typeof preview.serverTime === "string"
  );
}
