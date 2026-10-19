import { createServerFn } from "@tanstack/react-start";

import {
  createSolarisAuthenticatedClientServer,
  requireSolarisOrganizerServer,
} from "@/integrations/supabase/organizer.server";

type OperationIdentity = {
  operationId?: string;
  idempotencyKey?: string;
};

export type LineupMemberAction = "add_member" | "create_custom_member" | "remove_member";

export type GovernedOperationResult = {
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

async function reconcileBeforeRetry(
  client: any,
  operationId: string,
): Promise<GovernedOperationResult | null> {
  const response = await client.rpc("studio2_reconcile_operation", {
    p_operation_id: operationId,
  });
  if (response.error) {
    if (response.error.code === "P0002") return null;
    throw new Error(response.error.message);
  }

  const envelope = (response.data ?? {}) as ReconcileEnvelope;
  if (envelope.status !== "succeeded" || !envelope.result) {
    throw new Error(
      `The existing operation is ${envelope.status ?? "not complete"}. Reconcile it before starting another write.`,
    );
  }
  return {
    ok: true,
    operationId: envelope.operationId ?? operationId,
    replayed: true,
    result: envelope.result,
  };
}

function completed(
  data: unknown,
  fallbackOperationId: string,
): GovernedOperationResult {
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

async function authenticatedOrganizerClient() {
  await requireSolarisOrganizerServer();
  return createSolarisAuthenticatedClientServer() as any;
}

async function operationIdentity(
  data: OperationIdentity,
  prefix: string,
) {
  const operationId = data.operationId ?? crypto.randomUUID();
  const idempotencyKey = data.idempotencyKey ?? `${prefix}:${operationId}`;
  return { operationId, idempotencyKey };
}

export const executeLineupMemberOperation = createServerFn({ method: "POST" })
  .inputValidator((data: {
    editionId: string;
    showId: string;
    action: LineupMemberAction;
    payload?: Record<string, unknown>;
    reason?: string;
  } & OperationIdentity) => {
    const action = data?.action;
    if (!(["add_member", "create_custom_member", "remove_member"] as const).includes(action)) {
      throw new Error("Choose a valid line-up member operation");
    }
    return {
      editionId: requiredId(data?.editionId, "Edition"),
      showId: requiredId(data?.showId, "Show"),
      action,
      payload: objectPayload(data?.payload),
      reason: typeof data?.reason === "string" ? data.reason : undefined,
      operationId: optionalId(data?.operationId),
      idempotencyKey: optionalId(data?.idempotencyKey),
    };
  })
  .handler(async ({ data }): Promise<GovernedOperationResult> => {
    const client = await authenticatedOrganizerClient();
    const identity = await operationIdentity(data, `show-lineup:${data.action}`);

    if (data.operationId) {
      const recovered = await reconcileBeforeRetry(client, identity.operationId);
      if (recovered) return recovered;
    }

    let preflight: any;
    if (data.action === "remove_member") {
      const participantId = requiredId(data.payload.participantId, "Participant");
      const response = await client.rpc("v3_show_lineup_member_preflight", {
        p_edition_id: data.editionId,
        p_show_id: data.showId,
        p_participant_id: participantId,
      });
      if (response.error) throw new Error(response.error.message);
      preflight = response.data ?? {};
      if (!preflight.canRemove) {
        const total = Number(preflight.dependencies?.total ?? 0);
        throw new Error(
          total > 0
            ? `This entry still has ${total} official show reference${total === 1 ? "" : "s"}; remove or reconcile those facts first.`
            : "This entry cannot be removed from the show.",
        );
      }
    } else {
      const response = await client.rpc("v3_show_lineup_state_preflight", {
        p_edition_id: data.editionId,
        p_show_id: data.showId,
      });
      if (response.error) throw new Error(response.error.message);
      preflight = response.data ?? {};
    }
    if (!preflight.stateVersion) throw new Error("Line-up preflight did not return a state version.");

    const response = await client.rpc("v3_execute_show_lineup_member_operation", {
      p_edition_id: data.editionId,
      p_show_id: data.showId,
      p_action: data.action,
      p_payload: data.payload,
      p_operation_id: identity.operationId,
      p_idempotency_key: identity.idempotencyKey,
      p_expected_state_version: preflight.stateVersion,
      p_reason: data.reason?.trim() || null,
      p_correlation_id: identity.operationId,
    });
    if (response.error) throw new Error(response.error.message);
    return completed(response.data, identity.operationId);
  });

export const executeCustomContestEntityOperation = createServerFn({ method: "POST" })
  .inputValidator((data: {
    editionId: string;
    entityId: string;
    action: "update" | "delete";
    payload?: Record<string, unknown>;
    reason?: string;
  } & OperationIdentity) => {
    if (data?.action !== "update" && data?.action !== "delete") {
      throw new Error("Choose a valid custom-identity operation");
    }
    return {
      editionId: requiredId(data?.editionId, "Edition"),
      entityId: requiredId(data?.entityId, "Contest entity"),
      action: data.action,
      payload: objectPayload(data?.payload),
      reason: typeof data?.reason === "string" ? data.reason : undefined,
      operationId: optionalId(data?.operationId),
      idempotencyKey: optionalId(data?.idempotencyKey),
    };
  })
  .handler(async ({ data }): Promise<GovernedOperationResult> => {
    const client = await authenticatedOrganizerClient();
    const identity = await operationIdentity(data, `contest-entity:${data.action}`);

    if (data.operationId) {
      const recovered = await reconcileBeforeRetry(client, identity.operationId);
      if (recovered) return recovered;
    }

    const preflightResponse = await client.rpc("v3_custom_contest_entity_preflight", {
      p_edition_id: data.editionId,
      p_entity_id: data.entityId,
    });
    if (preflightResponse.error) throw new Error(preflightResponse.error.message);
    const preflight = preflightResponse.data ?? {};
    if (!preflight.updatedAt) throw new Error("Custom identity preflight did not return a version.");
    if (data.action === "delete" && !preflight.canDelete) {
      const total = Number(preflight.dependencies?.totalReferences ?? 0);
      throw new Error(
        `This custom identity still has ${total} canonical reference${total === 1 ? "" : "s"} and cannot be deleted.`,
      );
    }

    const response = await client.rpc("v3_execute_custom_contest_entity_operation", {
      p_edition_id: data.editionId,
      p_entity_id: data.entityId,
      p_action: data.action,
      p_payload: data.payload,
      p_operation_id: identity.operationId,
      p_idempotency_key: identity.idempotencyKey,
      p_expected_updated_at: preflight.updatedAt,
      p_reason: data.reason?.trim() || null,
      p_correlation_id: identity.operationId,
    });
    if (response.error) throw new Error(response.error.message);
    return completed(response.data, identity.operationId);
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
  .handler(async ({ data }): Promise<GovernedOperationResult> => {
    const client = await authenticatedOrganizerClient();
    const identity = await operationIdentity(data, "show-lineup:update-entry");
    if (data.operationId) {
      const recovered = await reconcileBeforeRetry(client, identity.operationId);
      if (recovered) return recovered;
    }

    const preflightResponse = await client.rpc("v3_show_lineup_state_preflight", {
      p_edition_id: data.editionId,
      p_show_id: data.showId,
    });
    if (preflightResponse.error) throw new Error(preflightResponse.error.message);
    const stateVersion = preflightResponse.data?.stateVersion;
    if (!stateVersion) throw new Error("Line-up preflight did not return a state version.");

    const response = await client.rpc("v3_execute_show_entry_detail_update", {
      p_edition_id: data.editionId,
      p_show_id: data.showId,
      p_participant_id: data.participantId,
      p_artist: data.artist,
      p_song: data.song,
      p_operation_id: identity.operationId,
      p_idempotency_key: identity.idempotencyKey,
      p_expected_state_version: stateVersion,
      p_correlation_id: identity.operationId,
    });
    if (response.error) throw new Error(response.error.message);
    return completed(response.data, identity.operationId);
  });

export const syncEditionEntryDetails = createServerFn({ method: "POST" })
  .inputValidator((data: { editionId: string } & OperationIdentity) => ({
    editionId: requiredId(data?.editionId, "Edition"),
    operationId: optionalId(data?.operationId),
    idempotencyKey: optionalId(data?.idempotencyKey),
  }))
  .handler(async ({ data }): Promise<GovernedOperationResult> => {
    const client = await authenticatedOrganizerClient();
    const identity = await operationIdentity(data, "entry-details:sync");
    if (data.operationId) {
      const recovered = await reconcileBeforeRetry(client, identity.operationId);
      if (recovered) return recovered;
    }

    const preflightResponse = await client.rpc("v3_entry_detail_sync_preflight", {
      p_edition_id: data.editionId,
    });
    if (preflightResponse.error) throw new Error(preflightResponse.error.message);
    const stateVersion = preflightResponse.data?.stateVersion;
    if (!stateVersion) throw new Error("Entry-detail preflight did not return a state version.");

    const response = await client.rpc("v3_execute_entry_detail_sync", {
      p_edition_id: data.editionId,
      p_operation_id: identity.operationId,
      p_idempotency_key: identity.idempotencyKey,
      p_expected_state_version: stateVersion,
      p_correlation_id: identity.operationId,
    });
    if (response.error) throw new Error(response.error.message);
    return completed(response.data, identity.operationId);
  });

export const promoteShowQualifiers = createServerFn({ method: "POST" })
  .inputValidator((data: { editionId: string; showId: string } & OperationIdentity) => ({
    editionId: requiredId(data?.editionId, "Edition"),
    showId: requiredId(data?.showId, "Show"),
    operationId: optionalId(data?.operationId),
    idempotencyKey: optionalId(data?.idempotencyKey),
  }))
  .handler(async ({ data }): Promise<GovernedOperationResult> => {
    const client = await authenticatedOrganizerClient();
    const identity = await operationIdentity(data, "show-lineup:promote-qualifiers");
    if (data.operationId) {
      const recovered = await reconcileBeforeRetry(client, identity.operationId);
      if (recovered) return recovered;
    }

    const preflightResponse = await client.rpc("v3_show_qualifier_preflight", {
      p_edition_id: data.editionId,
      p_show_id: data.showId,
    });
    if (preflightResponse.error) throw new Error(preflightResponse.error.message);
    const stateVersion = preflightResponse.data?.stateVersion;
    if (!stateVersion) throw new Error("Qualifier preflight did not return a state version.");

    const response = await client.rpc("v3_execute_show_qualifier_promotion", {
      p_edition_id: data.editionId,
      p_show_id: data.showId,
      p_operation_id: identity.operationId,
      p_idempotency_key: identity.idempotencyKey,
      p_expected_state_version: stateVersion,
      p_correlation_id: identity.operationId,
    });
    if (response.error) throw new Error(response.error.message);
    return completed(response.data, identity.operationId);
  });
