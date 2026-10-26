import { createServerFn } from "@tanstack/react-start";

import {
  createSolarisAuthenticatedClientServer,
  requireSolarisOrganizerServer,
} from "@/integrations/supabase/organizer.server";

export type ShowLineupMembershipAction =
  | "member_add"
  | "member_remove"
  | "promote_qualifiers";

type ShowLineupMembershipInput = {
  editionId: string;
  showId: string;
  action: ShowLineupMembershipAction;
  payload?: Record<string, unknown>;
  operationId?: string;
  idempotencyKey?: string;
  reason?: string;
};

type LineupPreflight = {
  ok?: boolean;
  stateVersion?: string;
  blockers?: string[];
};

type MembershipEnvelope = {
  operationId?: string;
  replayed?: boolean;
  status?: string;
  result?: {
    ok?: boolean;
    operationId?: string;
    showId?: string;
    showName?: string;
    action?: string;
    lineupStage?: string | null;
    stateVersion?: string;
    participantCount?: number;
    changedCount?: number;
    dependencies?: Record<string, unknown>;
    sourceParticipantIds?: string[];
  } | null;
};

export type ShowLineupMembershipResult = {
  ok: true;
  operationId: string;
  showId: string;
  showName: string;
  action: string;
  lineupStage: string | null;
  stateVersion: string;
  participantCount: number;
  changedCount: number;
  dependencies: Record<string, unknown>;
  sourceParticipantIds: string[];
  replayed: boolean;
};

const membershipActions = new Set<ShowLineupMembershipAction>([
  "member_add",
  "member_remove",
  "promote_qualifiers",
]);

function requireId(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

function optionalId(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requireMembershipAction(value: unknown): ShowLineupMembershipAction {
  if (
    typeof value !== "string" ||
    !membershipActions.has(value as ShowLineupMembershipAction)
  ) {
    throw new Error("Choose a valid line-up membership operation");
  }
  return value as ShowLineupMembershipAction;
}

function describeBlockers(blockers: unknown) {
  if (!Array.isArray(blockers) || blockers.length === 0) {
    return "The line-up membership operation is currently blocked.";
  }
  return blockers
    .filter((value): value is string => typeof value === "string")
    .join(", ");
}

function completedMembershipResult(
  envelope: MembershipEnvelope,
  fallbackOperationId: string,
  replayed: boolean,
): ShowLineupMembershipResult {
  const result = envelope.result ?? {};
  const operationId = envelope.operationId ?? result.operationId ?? fallbackOperationId;
  if (!result.ok || !result.showId || !result.showName || !result.stateVersion || !result.action) {
    throw new Error("The canonical line-up membership command returned an incomplete receipt.");
  }

  return {
    ok: true,
    operationId,
    showId: result.showId,
    showName: result.showName,
    action: result.action,
    lineupStage: result.lineupStage ?? null,
    stateVersion: result.stateVersion,
    participantCount: result.participantCount ?? 0,
    changedCount: result.changedCount ?? 0,
    dependencies: result.dependencies ?? {},
    sourceParticipantIds: Array.isArray(result.sourceParticipantIds)
      ? result.sourceParticipantIds
      : [],
    replayed,
  };
}

async function reconcileExistingOperation(client: any, operationId: string) {
  const reconciliation = await client.rpc("studio2_reconcile_operation", {
    p_operation_id: operationId,
  });
  if (!reconciliation.error) {
    const envelope = (reconciliation.data ?? {}) as MembershipEnvelope;
    if (envelope.status === "succeeded") return envelope;
    throw new Error(
      `The existing line-up membership operation is ${envelope.status ?? "not complete"}. Reconcile it before starting another write.`,
    );
  }
  if (reconciliation.error.code !== "P0002") {
    throw new Error(reconciliation.error.message);
  }
  return null;
}

async function runShowLineupMembershipOperation(
  data: ShowLineupMembershipInput,
): Promise<ShowLineupMembershipResult> {
  await requireSolarisOrganizerServer();
  const client = createSolarisAuthenticatedClientServer() as any;
  const payload = data.payload ?? {};
  const operationId = data.operationId ?? crypto.randomUUID();
  const idempotencyKey =
    data.idempotencyKey ?? `show-lineup-membership:${data.action}:${operationId}`;

  // Unknown-outcome retries must reconcile the known operation before a fresh
  // preflight. A successful first request advances the show state version.
  if (data.operationId) {
    const existing = await reconcileExistingOperation(client, operationId);
    if (existing) return completedMembershipResult(existing, operationId, true);
  }

  const preflightResponse = await client.rpc("v3_show_lineup_membership_preflight", {
    p_edition_id: data.editionId,
    p_show_id: data.showId,
    p_action: data.action,
    p_payload: payload,
  });
  if (preflightResponse.error) throw new Error(preflightResponse.error.message);

  const preflight = (preflightResponse.data ?? {}) as LineupPreflight;
  if (!preflight.ok || !preflight.stateVersion) {
    throw new Error(describeBlockers(preflight.blockers));
  }

  const operationResponse = await client.rpc(
    "v3_execute_show_lineup_membership_operation",
    {
      p_edition_id: data.editionId,
      p_show_id: data.showId,
      p_action: data.action,
      p_payload: payload,
      p_operation_id: operationId,
      p_idempotency_key: idempotencyKey,
      p_expected_state_version: preflight.stateVersion,
      p_reason: data.reason?.trim() || null,
      p_correlation_id: operationId,
    },
  );
  if (operationResponse.error) throw new Error(operationResponse.error.message);

  const envelope = (operationResponse.data ?? {}) as MembershipEnvelope;
  return completedMembershipResult(envelope, operationId, Boolean(envelope.replayed));
}

export const executeShowLineupMembershipOperation = createServerFn({ method: "POST" })
  .inputValidator((data: ShowLineupMembershipInput) => ({
    editionId: requireId(data?.editionId, "Edition"),
    showId: requireId(data?.showId, "Show"),
    action: requireMembershipAction(data?.action),
    payload:
      data?.payload && typeof data.payload === "object" && !Array.isArray(data.payload)
        ? data.payload
        : {},
    operationId: optionalId(data?.operationId),
    idempotencyKey: optionalId(data?.idempotencyKey),
    reason: typeof data?.reason === "string" ? data.reason : undefined,
  }))
  .handler(async ({ data }): Promise<ShowLineupMembershipResult> =>
    runShowLineupMembershipOperation(data),
  );
