import { createServerFn } from "@tanstack/react-start";

import {
  createSolarisAuthenticatedClientServer,
  requireSolarisOrganizerServer,
} from "@/integrations/supabase/organizer.server";

export type ShowLineupMetadataAction =
  | "member_metadata_update"
  | "sync_entry_metadata";

type ShowLineupMetadataInput = {
  editionId: string;
  showId: string;
  action: ShowLineupMetadataAction;
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

type MetadataEnvelope = {
  operationId?: string;
  replayed?: boolean;
  status?: string;
  result?: {
    ok?: boolean;
    operationId?: string;
    showId?: string;
    showName?: string;
    action?: string;
    stateVersion?: string;
    participantCount?: number;
    changedCount?: number;
  } | null;
};

export type ShowLineupMetadataResult = {
  ok: true;
  operationId: string;
  showId: string;
  showName: string;
  action: string;
  stateVersion: string;
  participantCount: number;
  changedCount: number;
  replayed: boolean;
};

const metadataActions = new Set<ShowLineupMetadataAction>([
  "member_metadata_update",
  "sync_entry_metadata",
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

function requireMetadataAction(value: unknown): ShowLineupMetadataAction {
  if (
    typeof value !== "string" ||
    !metadataActions.has(value as ShowLineupMetadataAction)
  ) {
    throw new Error("Choose a valid line-up metadata operation");
  }
  return value as ShowLineupMetadataAction;
}

function describeBlockers(blockers: unknown) {
  if (!Array.isArray(blockers) || blockers.length === 0) {
    return "The line-up metadata operation is currently blocked.";
  }
  return blockers
    .filter((value): value is string => typeof value === "string")
    .join(", ");
}

function completedMetadataResult(
  envelope: MetadataEnvelope,
  fallbackOperationId: string,
  replayed: boolean,
): ShowLineupMetadataResult {
  const result = envelope.result ?? {};
  const operationId = envelope.operationId ?? result.operationId ?? fallbackOperationId;
  if (!result.ok || !result.showId || !result.showName || !result.stateVersion || !result.action) {
    throw new Error("The canonical line-up metadata command returned an incomplete receipt.");
  }
  return {
    ok: true,
    operationId,
    showId: result.showId,
    showName: result.showName,
    action: result.action,
    stateVersion: result.stateVersion,
    participantCount: result.participantCount ?? 0,
    changedCount: result.changedCount ?? 0,
    replayed,
  };
}

async function reconcileExistingOperation(client: any, operationId: string) {
  const reconciliation = await client.rpc("studio2_reconcile_operation", {
    p_operation_id: operationId,
  });
  if (!reconciliation.error) {
    const envelope = (reconciliation.data ?? {}) as MetadataEnvelope;
    if (envelope.status === "succeeded") return envelope;
    throw new Error(
      `The existing line-up metadata operation is ${envelope.status ?? "not complete"}. Reconcile it before starting another write.`,
    );
  }
  if (reconciliation.error.code !== "P0002") {
    throw new Error(reconciliation.error.message);
  }
  return null;
}

async function runShowLineupMetadataOperation(
  data: ShowLineupMetadataInput,
): Promise<ShowLineupMetadataResult> {
  await requireSolarisOrganizerServer();
  const client = createSolarisAuthenticatedClientServer() as any;
  const payload = data.payload ?? {};
  const operationId = data.operationId ?? crypto.randomUUID();
  const idempotencyKey =
    data.idempotencyKey ?? `show-lineup-metadata:${data.action}:${operationId}`;

  if (data.operationId) {
    const existing = await reconcileExistingOperation(client, operationId);
    if (existing) return completedMetadataResult(existing, operationId, true);
  }

  const preflightResponse = await client.rpc("v3_show_lineup_metadata_preflight", {
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

  const operationResponse = await client.rpc("v3_execute_show_lineup_metadata_operation", {
    p_edition_id: data.editionId,
    p_show_id: data.showId,
    p_action: data.action,
    p_payload: payload,
    p_operation_id: operationId,
    p_idempotency_key: idempotencyKey,
    p_expected_state_version: preflight.stateVersion,
    p_reason: data.reason?.trim() || null,
    p_correlation_id: operationId,
  });
  if (operationResponse.error) throw new Error(operationResponse.error.message);

  const envelope = (operationResponse.data ?? {}) as MetadataEnvelope;
  return completedMetadataResult(envelope, operationId, Boolean(envelope.replayed));
}

export const executeShowLineupMetadataOperation = createServerFn({ method: "POST" })
  .inputValidator((data: ShowLineupMetadataInput) => ({
    editionId: requireId(data?.editionId, "Edition"),
    showId: requireId(data?.showId, "Show"),
    action: requireMetadataAction(data?.action),
    payload:
      data?.payload && typeof data.payload === "object" && !Array.isArray(data.payload)
        ? data.payload
        : {},
    operationId: optionalId(data?.operationId),
    idempotencyKey: optionalId(data?.idempotencyKey),
    reason: typeof data?.reason === "string" ? data.reason : undefined,
  }))
  .handler(async ({ data }): Promise<ShowLineupMetadataResult> =>
    runShowLineupMetadataOperation(data),
  );
