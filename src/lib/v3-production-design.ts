import { supabase as baseSupabase } from "@/integrations/supabase/client";

export type ProductionDesignMode =
  | "edition_default"
  | "show_override"
  | "show_reset";

export type ProductionDesignShowConfig = {
  showId: string;
  broadcastConfig: Record<string, unknown>;
  scoreboardConfig: Record<string, unknown>;
};

export type ProductionDesignMutationRequest = {
  mode: ProductionDesignMode;
  showId?: string;
  themeConfig?: Record<string, unknown>;
  broadcastConfig: Record<string, unknown>;
  scoreboardConfig: Record<string, unknown>;
  showConfigs?: readonly ProductionDesignShowConfig[];
};

export type ProductionDesignProjection = {
  schemaVersion: number;
  editionId: string;
  showId: string | null;
  stateVersion: string;
  state: Record<string, unknown>;
  serverTime: string;
};

export type ProductionDesignCommandResult = {
  ok: boolean;
  mode?: ProductionDesignMode;
  editionId?: string;
  showId?: string | null;
  affectedShowIds?: string[];
  stateVersion?: string;
  operationId: string;
  receiptId?: string;
  correlationId?: string;
  status?: string;
  replayed: boolean;
  serverTime?: string;
  error?: {
    code?: string;
    metadata?: Record<string, unknown>;
  } | null;
};

export type ProductionDesignCommandIdentity = {
  operationId: string;
  idempotencyKey: string;
};

type RpcError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

type RpcResult = {
  data: unknown;
  error: RpcError | null;
};

export type ProductionDesignRpcClient = {
  rpc(name: string, params: Record<string, unknown>): Promise<RpcResult>;
};

const rpcClient = baseSupabase as unknown as ProductionDesignRpcClient;

function objectOrNull(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Production design response is missing ${field}.`);
  }
  return value;
}

function rpcFailure(error: RpcError, action: string) {
  const detail = error.message?.trim() || error.code?.trim() || "Unknown server error";
  return new Error(`${action}: ${detail}`);
}

export function createProductionDesignCommandIdentity(
  input: {
    editionId: string;
    mode: ProductionDesignMode;
    showId?: string | null;
  },
  randomUuid: () => string = () => globalThis.crypto.randomUUID(),
): ProductionDesignCommandIdentity {
  if (!input.editionId.trim()) throw new Error("Production design edition is required.");
  if (input.mode !== "edition_default" && !input.showId?.trim()) {
    throw new Error("Production design show is required for a show-scoped command.");
  }

  const operationId = randomUuid();
  if (!operationId.trim()) throw new Error("Production design operation id is required.");
  const subject = input.showId?.trim() || "edition";

  return {
    operationId,
    idempotencyKey: `production-design:${input.mode}:${input.editionId}:${subject}:${operationId}`,
  };
}

export async function loadProductionDesignProjection(
  input: { editionId: string; showId?: string | null },
  client: ProductionDesignRpcClient = rpcClient,
): Promise<ProductionDesignProjection> {
  const { data, error } = await client.rpc("admin_production_design_projection", {
    p_edition_id: input.editionId,
    p_show_id: input.showId ?? null,
  });
  if (error) throw rpcFailure(error, "Could not load authoritative Production state");

  const row = objectOrNull(data);
  if (!row) throw new Error("Production design projection returned an invalid response.");

  return {
    schemaVersion:
      typeof row.schemaVersion === "number" && Number.isInteger(row.schemaVersion)
        ? row.schemaVersion
        : 0,
    editionId: requiredString(row.editionId, "editionId"),
    showId: typeof row.showId === "string" ? row.showId : null,
    stateVersion: requiredString(row.stateVersion, "stateVersion"),
    state: objectOrNull(row.state) ?? {},
    serverTime: requiredString(row.serverTime, "serverTime"),
  };
}

export async function applyProductionDesign(
  input: {
    editionId: string;
    request: ProductionDesignMutationRequest;
    expectedStateVersion: string;
    operationId: string;
    idempotencyKey: string;
    reason?: string | null;
  },
  client: ProductionDesignRpcClient = rpcClient,
): Promise<ProductionDesignCommandResult> {
  const { data, error } = await client.rpc("admin_apply_production_design", {
    p_edition_id: input.editionId,
    p_request: input.request,
    p_expected_state_version: input.expectedStateVersion,
    p_operation_id: input.operationId,
    p_idempotency_key: input.idempotencyKey,
    p_reason: input.reason?.trim() || null,
  });
  if (error) throw rpcFailure(error, "Could not apply reviewed Production design");

  const row = objectOrNull(data);
  if (!row) throw new Error("Production design command returned an invalid response.");

  const operationId = requiredString(row.operationId, "operationId");
  const rawError = objectOrNull(row.error);
  const result: ProductionDesignCommandResult = {
    ok: row.ok === true,
    mode:
      row.mode === "edition_default"
      || row.mode === "show_override"
      || row.mode === "show_reset"
        ? row.mode
        : undefined,
    editionId: typeof row.editionId === "string" ? row.editionId : undefined,
    showId: typeof row.showId === "string" ? row.showId : row.showId === null ? null : undefined,
    affectedShowIds: Array.isArray(row.affectedShowIds)
      ? row.affectedShowIds.filter((value): value is string => typeof value === "string")
      : undefined,
    stateVersion: typeof row.stateVersion === "string" ? row.stateVersion : undefined,
    operationId,
    receiptId: typeof row.receiptId === "string" ? row.receiptId : undefined,
    correlationId: typeof row.correlationId === "string" ? row.correlationId : undefined,
    status: typeof row.status === "string" ? row.status : undefined,
    replayed: row.replayed === true,
    serverTime: typeof row.serverTime === "string" ? row.serverTime : undefined,
    error: rawError
      ? {
          code: typeof rawError.code === "string" ? rawError.code : undefined,
          metadata: objectOrNull(rawError.metadata) ?? undefined,
        }
      : null,
  };

  return result;
}

export async function reconcileProductionDesignOperation(
  operationId: string,
  client: ProductionDesignRpcClient = rpcClient,
): Promise<Record<string, unknown>> {
  const { data, error } = await client.rpc("studio2_reconcile_operation", {
    p_operation_id: operationId,
  });
  if (error) throw rpcFailure(error, "Could not reconcile Production operation");

  const row = objectOrNull(data);
  if (!row) throw new Error("Production operation reconciliation returned an invalid response.");
  return row;
}
