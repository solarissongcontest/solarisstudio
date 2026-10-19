import { createServerFn } from "@tanstack/react-start";

import {
  createSolarisAuthenticatedClientServer,
  requireSolarisOrganizerServer,
} from "@/integrations/supabase/organizer.server";

type OperationIdentity = { operationId?: string; idempotencyKey?: string };

type OperationResult = {
  ok: true;
  operationId: string;
  replayed: boolean;
  result: Record<string, unknown>;
};

type ReconcileEnvelope = {
  operationId?: string;
  status?: string;
  result?: Record<string, unknown> | null;
  replayed?: boolean;
};

function requiredId(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function optionalId(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function objectPayload(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function organizerClient() {
  await requireSolarisOrganizerServer();
  return createSolarisAuthenticatedClientServer() as any;
}

function identity(data: OperationIdentity, prefix: string) {
  const operationId = data.operationId ?? crypto.randomUUID();
  return {
    operationId,
    idempotencyKey: data.idempotencyKey ?? `${prefix}:${operationId}`,
  };
}

async function reconcileKnown(client: any, operationId?: string): Promise<OperationResult | null> {
  if (!operationId) return null;
  const response = await client.rpc("studio2_reconcile_operation", { p_operation_id: operationId });
  if (response.error) {
    if (response.error.code === "P0002") return null;
    throw new Error(response.error.message);
  }
  const envelope = (response.data ?? {}) as ReconcileEnvelope;
  if (envelope.status !== "succeeded" || !envelope.result) {
    throw new Error(`The existing operation is ${envelope.status ?? "not complete"}. Reconcile it before retrying.`);
  }
  return {
    ok: true,
    operationId: envelope.operationId ?? operationId,
    replayed: true,
    result: envelope.result,
  };
}

function completed(data: unknown, fallbackOperationId: string): OperationResult {
  const envelope = (data ?? {}) as ReconcileEnvelope;
  const result = envelope.result ?? {};
  if (result.ok !== true) throw new Error("The canonical operation returned an incomplete receipt.");
  return {
    ok: true,
    operationId:
      (typeof envelope.operationId === "string" && envelope.operationId) ||
      (typeof result.operationId === "string" && result.operationId) ||
      fallbackOperationId,
    replayed: Boolean(envelope.replayed),
    result,
  };
}

export const ensureGlobalContestEntity = createServerFn({ method: "POST" })
  .inputValidator((data: { editionId: string; countryId: string } & OperationIdentity) => ({
    editionId: requiredId(data?.editionId, "Edition"),
    countryId: requiredId(data?.countryId, "Country"),
    operationId: optionalId(data?.operationId),
    idempotencyKey: optionalId(data?.idempotencyKey),
  }))
  .handler(async ({ data }): Promise<OperationResult> => {
    const client = await organizerClient();
    const recovered = await reconcileKnown(client, data.operationId);
    if (recovered) return recovered;
    const op = identity(data, "contest-entity:global:ensure");
    const response = await client.rpc("v3_ensure_global_contest_entity", {
      p_edition_id: data.editionId,
      p_country_id: data.countryId,
      p_operation_id: op.operationId,
      p_idempotency_key: op.idempotencyKey,
      p_correlation_id: op.operationId,
    });
    if (response.error) throw new Error(response.error.message);
    return completed(response.data, op.operationId);
  });

export const executeCustomContestEntityOperation = createServerFn({ method: "POST" })
  .inputValidator((data: {
    editionId: string;
    entityId?: string;
    action: "create" | "update" | "delete";
    payload?: Record<string, unknown>;
    reason?: string;
  } & OperationIdentity) => {
    const action = data?.action;
    if (action !== "create" && action !== "update" && action !== "delete") {
      throw new Error("Choose a valid custom identity operation");
    }
    return {
      editionId: requiredId(data?.editionId, "Edition"),
      entityId: optionalId(data?.entityId),
      action,
      payload: objectPayload(data?.payload),
      reason: typeof data?.reason === "string" ? data.reason : undefined,
      operationId: optionalId(data?.operationId),
      idempotencyKey: optionalId(data?.idempotencyKey),
    };
  })
  .handler(async ({ data }): Promise<OperationResult> => {
    const client = await organizerClient();
    const recovered = await reconcileKnown(client, data.operationId);
    if (recovered) return recovered;
    const op = identity(data, `contest-entity:custom:${data.action}`);

    let expectedUpdatedAt: string | null = null;
    if (data.action !== "create") {
      const entityId = requiredId(data.entityId, "Contest entity");
      const preflight = await client.rpc("v3_custom_contest_entity_preflight", {
        p_edition_id: data.editionId,
        p_entity_id: entityId,
      });
      if (preflight.error) throw new Error(preflight.error.message);
      expectedUpdatedAt = preflight.data?.updatedAt ?? null;
      if (!expectedUpdatedAt) throw new Error("Custom identity preflight did not return a version.");
      if (data.action === "delete" && !preflight.data?.canDelete) {
        const count = Number(preflight.data?.dependencies?.totalReferences ?? 0);
        throw new Error(`This custom identity still has ${count} canonical reference${count === 1 ? "" : "s"}.`);
      }
    }

    const response = await client.rpc("v3_execute_custom_contest_entity_operation", {
      p_edition_id: data.editionId,
      p_entity_id: data.entityId ?? null,
      p_action: data.action,
      p_payload: data.payload,
      p_operation_id: op.operationId,
      p_idempotency_key: op.idempotencyKey,
      p_expected_updated_at: expectedUpdatedAt,
      p_reason: data.reason?.trim() || null,
      p_correlation_id: op.operationId,
    });
    if (response.error) throw new Error(response.error.message);
    return completed(response.data, op.operationId);
  });

export const updateShowLineupEntryDetails = createServerFn({ method: "POST" })
  .inputValidator((data: {
    editionId: string;
    showId: string;
    participantId: string;
    artist?: string;
    song?: string;
  } & OperationIdentity) => ({
    editionId: requiredId(data?.editionId, "Edition"),
    showId: requiredId(data?.showId, "Show"),
    participantId: requiredId(data?.participantId, "Participant"),
    artist: typeof data?.artist === "string" ? data.artist : "",
    song: typeof data?.song === "string" ? data.song : "",
    operationId: optionalId(data?.operationId),
    idempotencyKey: optionalId(data?.idempotencyKey),
  }))
  .handler(async ({ data }): Promise<OperationResult> => {
    const client = await organizerClient();
    const recovered = await reconcileKnown(client, data.operationId);
    if (recovered) return recovered;
    const op = identity(data, "show-lineup:entry:update");

    const preflight = await client.rpc("v3_show_lineup_state_preflight", {
      p_edition_id: data.editionId,
      p_show_id: data.showId,
    });
    if (preflight.error) throw new Error(preflight.error.message);
    const stateVersion = preflight.data?.stateVersion;
    if (!stateVersion) throw new Error("Line-up preflight did not return a state version.");

    const response = await client.rpc("v3_execute_show_entry_detail_update", {
      p_edition_id: data.editionId,
      p_show_id: data.showId,
      p_participant_id: data.participantId,
      p_artist: data.artist,
      p_song: data.song,
      p_operation_id: op.operationId,
      p_idempotency_key: op.idempotencyKey,
      p_expected_state_version: stateVersion,
      p_correlation_id: op.operationId,
    });
    if (response.error) throw new Error(response.error.message);
    return completed(response.data, op.operationId);
  });

export const syncEditionEntryDetails = createServerFn({ method: "POST" })
  .inputValidator((data: { editionId: string } & OperationIdentity) => ({
    editionId: requiredId(data?.editionId, "Edition"),
    operationId: optionalId(data?.operationId),
    idempotencyKey: optionalId(data?.idempotencyKey),
  }))
  .handler(async ({ data }): Promise<OperationResult> => {
    const client = await organizerClient();
    const recovered = await reconcileKnown(client, data.operationId);
    if (recovered) return recovered;
    const op = identity(data, "entry-details:sync");

    const preflight = await client.rpc("v3_entry_detail_sync_preflight", {
      p_edition_id: data.editionId,
    });
    if (preflight.error) throw new Error(preflight.error.message);
    const stateVersion = preflight.data?.stateVersion;
    if (!stateVersion) throw new Error("Entry-detail preflight did not return a state version.");

    const response = await client.rpc("v3_execute_entry_detail_sync", {
      p_edition_id: data.editionId,
      p_operation_id: op.operationId,
      p_idempotency_key: op.idempotencyKey,
      p_expected_state_version: stateVersion,
      p_correlation_id: op.operationId,
    });
    if (response.error) throw new Error(response.error.message);
    return completed(response.data, op.operationId);
  });
