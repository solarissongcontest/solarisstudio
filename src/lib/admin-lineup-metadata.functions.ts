import { createServerFn } from "@tanstack/react-start";

import {
  createSolarisAuthenticatedClientServer,
  requireSolarisOrganizerServer,
} from "@/integrations/supabase/organizer.server";

type OperationIdentity = {
  operationId?: string;
  idempotencyKey?: string;
};

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
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required`);
  }
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

function operationIdentity(data: OperationIdentity, prefix: string) {
  const operationId = data.operationId ?? crypto.randomUUID();
  return {
    operationId,
    idempotencyKey: data.idempotencyKey ?? `${prefix}:${operationId}`,
  };
}

async function reconcileKnownOperation(
  client: any,
  operationId?: string,
): Promise<OperationResult | null> {
  if (!operationId) return null;

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
      `The existing operation is ${envelope.status ?? "not complete"}. Reconcile it before retrying.`,
    );
  }

  return {
    ok: true,
    operationId: envelope.operationId ?? operationId,
    replayed: true,
    result: envelope.result,
  };
}

function completedOperation(
  data: unknown,
  fallbackOperationId: string,
): OperationResult {
  const envelope = (data ?? {}) as ReconcileEnvelope;
  const result = envelope.result ?? {};
  if (result.ok !== true) {
    throw new Error("The canonical contest-identity operation returned an incomplete receipt.");
  }

  const resultOperationId =
    typeof result.operationId === "string" ? result.operationId : undefined;

  return {
    ok: true,
    operationId:
      (typeof envelope.operationId === "string" && envelope.operationId) ||
      resultOperationId ||
      fallbackOperationId,
    replayed: Boolean(envelope.replayed),
    result,
  };
}

export const ensureGlobalContestEntity = createServerFn({ method: "POST" })
  .inputValidator((data: {
    editionId: string;
    countryId: string;
  } & OperationIdentity) => ({
    editionId: requiredId(data?.editionId, "Edition"),
    countryId: requiredId(data?.countryId, "Country"),
    operationId: optionalId(data?.operationId),
    idempotencyKey: optionalId(data?.idempotencyKey),
  }))
  .handler(async ({ data }): Promise<OperationResult> => {
    const client = await organizerClient();

    // If a previous request may have succeeded but its response was lost, the
    // receipt is authoritative. Reconcile before attempting another write.
    const recovered = await reconcileKnownOperation(client, data.operationId);
    if (recovered) return recovered;

    const operation = operationIdentity(data, "contest-entity:global:ensure");
    const response = await client.rpc("v3_ensure_global_contest_entity", {
      p_edition_id: data.editionId,
      p_country_id: data.countryId,
      p_operation_id: operation.operationId,
      p_idempotency_key: operation.idempotencyKey,
      p_correlation_id: operation.operationId,
    });
    if (response.error) throw new Error(response.error.message);

    return completedOperation(response.data, operation.operationId);
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

    const recovered = await reconcileKnownOperation(client, data.operationId);
    if (recovered) return recovered;

    const operation = operationIdentity(
      data,
      `contest-entity:custom:${data.action}`,
    );

    let expectedUpdatedAt: string | null = null;
    if (data.action !== "create") {
      const entityId = requiredId(data.entityId, "Contest entity");
      const preflightResponse = await client.rpc(
        "v3_custom_contest_entity_preflight",
        {
          p_edition_id: data.editionId,
          p_entity_id: entityId,
        },
      );
      if (preflightResponse.error) {
        throw new Error(preflightResponse.error.message);
      }

      const preflight = preflightResponse.data ?? {};
      expectedUpdatedAt = preflight.updatedAt ?? null;
      if (!expectedUpdatedAt) {
        throw new Error("Custom identity preflight did not return a version.");
      }

      if (data.action === "delete" && !preflight.canDelete) {
        const count = Number(preflight.dependencies?.totalReferences ?? 0);
        throw new Error(
          `This custom identity still has ${count} canonical reference${count === 1 ? "" : "s"}.`,
        );
      }
    }

    const response = await client.rpc(
      "v3_execute_custom_contest_entity_operation",
      {
        p_edition_id: data.editionId,
        p_entity_id: data.entityId ?? null,
        p_action: data.action,
        p_payload: data.payload,
        p_operation_id: operation.operationId,
        p_idempotency_key: operation.idempotencyKey,
        p_expected_updated_at: expectedUpdatedAt,
        p_reason: data.reason?.trim() || null,
        p_correlation_id: operation.operationId,
      },
    );
    if (response.error) throw new Error(response.error.message);

    return completedOperation(response.data, operation.operationId);
  });
