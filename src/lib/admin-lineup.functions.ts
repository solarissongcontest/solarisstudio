import { createServerFn } from "@tanstack/react-start";

import {
  createSolarisAuthenticatedClientServer,
  requireSolarisOrganizerServer,
} from "@/integrations/supabase/organizer.server";

export type ShowLineupOperationAction =
  | "start_allocation"
  | "save_allocation"
  | "start_running_order"
  | "save_running_order"
  | "sync_confirmed_countries";

type ShowLineupOperationInput = {
  editionId: string;
  showId: string;
  action: ShowLineupOperationAction;
  payload?: Record<string, unknown>;
  operationId?: string;
  idempotencyKey?: string;
  reason?: string;
};

type AddCountriesInput = {
  editionId: string;
  showId: string;
  countryIds?: string[];
  operationId?: string;
  idempotencyKey?: string;
};

type SyncTargetsInput = {
  editionNumber: number;
};

export type SolarisSyncTarget = {
  id: string;
  name: string;
  kind: string;
  sort_order: number;
};

export type SolarisSyncTargets = {
  editionId: string;
  editionName: string;
  editionSlug: string;
  shows: SolarisSyncTarget[];
};

export type ShowLineupOperationResult = {
  ok: true;
  operationId: string;
  showId: string;
  showName: string;
  action: string;
  lineupStage: string | null;
  stateVersion: string;
  participantCount: number;
  added: number;
  refreshed: number;
  skipped: number;
  changed: boolean;
  replayed: boolean;
};

export type AddCountriesToShowResult = ShowLineupOperationResult & {
  countryIds: string[];
};

type LineupPreflight = {
  ok?: boolean;
  stateVersion?: string;
  blockers?: string[];
};

type LineupOperationEnvelope = {
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
    added?: number;
    refreshed?: number;
    skipped?: number;
    changed?: boolean;
  } | null;
};

const lineupActions = new Set<ShowLineupOperationAction>([
  "start_allocation",
  "save_allocation",
  "start_running_order",
  "save_running_order",
  "sync_confirmed_countries",
]);

function requireId(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function optionalId(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requireAction(value: unknown): ShowLineupOperationAction {
  if (typeof value !== "string" || !lineupActions.has(value as ShowLineupOperationAction)) {
    throw new Error("Choose a valid line-up operation");
  }
  return value as ShowLineupOperationAction;
}

function describeBlockers(blockers: unknown) {
  if (!Array.isArray(blockers) || blockers.length === 0) return "The line-up operation is currently blocked.";
  return blockers.filter((value): value is string => typeof value === "string").join(", ");
}

function completedOperationResult(
  envelope: LineupOperationEnvelope,
  fallbackOperationId: string,
  replayed: boolean,
): ShowLineupOperationResult {
  const result = envelope.result ?? {};
  const canonicalOperationId = envelope.operationId ?? result.operationId ?? fallbackOperationId;
  if (!result.ok || !result.showId || !result.showName || !result.stateVersion || !result.action) {
    throw new Error("The canonical line-up command returned an incomplete receipt.");
  }

  return {
    ok: true,
    operationId: canonicalOperationId,
    showId: result.showId,
    showName: result.showName,
    action: result.action,
    lineupStage: result.lineupStage ?? null,
    stateVersion: result.stateVersion,
    participantCount: result.participantCount ?? 0,
    added: result.added ?? 0,
    refreshed: result.refreshed ?? 0,
    skipped: result.skipped ?? 0,
    changed: Boolean(result.changed),
    replayed,
  };
}

async function runShowLineupOperation(
  data: ShowLineupOperationInput,
): Promise<ShowLineupOperationResult> {
  await requireSolarisOrganizerServer();

  // Use the request's authenticated Solaris identity for canonical commands.
  // Exact-edition capability checks remain server-authoritative inside the RPC.
  const client = createSolarisAuthenticatedClientServer() as any;
  const payload = data.payload ?? {};
  const operationId = data.operationId ?? crypto.randomUUID();
  const idempotencyKey = data.idempotencyKey ?? `show-lineup:${data.action}:${operationId}`;

  // Lost-response recovery must happen before a fresh preflight. A successful
  // first request advances canonical state, so preflighting first would produce
  // a different state-version fingerprint and turn a safe replay into an
  // IDEMPOTENCY_CONFLICT.
  if (data.operationId) {
    const reconciliation = await client.rpc("studio2_reconcile_operation", {
      p_operation_id: operationId,
    });
    if (!reconciliation.error) {
      const envelope = (reconciliation.data ?? {}) as LineupOperationEnvelope;
      if (envelope.status === "succeeded") {
        return completedOperationResult(envelope, operationId, true);
      }
      throw new Error(`The existing line-up operation is ${envelope.status ?? "not complete"}. Reconcile it before starting another write.`);
    }
    if (reconciliation.error.code !== "P0002") {
      throw new Error(reconciliation.error.message);
    }
  }

  const preflightResponse = await client.rpc("v3_show_lineup_preflight", {
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

  const operationResponse = await client.rpc("v3_execute_show_lineup_operation", {
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

  const envelope = (operationResponse.data ?? {}) as LineupOperationEnvelope;
  return completedOperationResult(envelope, operationId, Boolean(envelope.replayed));
}

export const getSolarisEditionSyncTargets = createServerFn({ method: "POST" })
  .inputValidator((data: SyncTargetsInput) => {
    const editionNumber = Number(data?.editionNumber);
    if (!Number.isInteger(editionNumber) || editionNumber <= 0) throw new Error("Choose a valid edition");
    return { editionNumber };
  })
  .handler(async ({ data }): Promise<SolarisSyncTargets> => {
    await requireSolarisOrganizerServer();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    const editionResult = await db
      .from("editions")
      .select("id,name,slug,edition_number")
      .eq("edition_number", data.editionNumber)
      .maybeSingle();
    if (editionResult.error) throw new Error(editionResult.error.message);
    if (!editionResult.data) throw new Error(`SSC${data.editionNumber} does not exist in Solaris Studio.`);

    const showsResult = await db
      .from("shows")
      .select("id,name,kind,sort_order")
      .eq("edition_id", editionResult.data.id)
      .order("sort_order");
    if (showsResult.error) throw new Error(showsResult.error.message);

    return {
      editionId: editionResult.data.id,
      editionName: editionResult.data.name,
      editionSlug: editionResult.data.slug,
      shows: (showsResult.data ?? []) as SolarisSyncTarget[],
    };
  });

export const executeShowLineupOperation = createServerFn({ method: "POST" })
  .inputValidator((data: ShowLineupOperationInput) => ({
    editionId: requireId(data?.editionId, "Edition"),
    showId: requireId(data?.showId, "Show"),
    action: requireAction(data?.action),
    payload: data?.payload && typeof data.payload === "object" && !Array.isArray(data.payload) ? data.payload : {},
    operationId: optionalId(data?.operationId),
    idempotencyKey: optionalId(data?.idempotencyKey),
    reason: typeof data?.reason === "string" ? data.reason : undefined,
  }))
  .handler(async ({ data }): Promise<ShowLineupOperationResult> => runShowLineupOperation(data));

export const addCountriesToShow = createServerFn({ method: "POST" })
  .inputValidator((data: AddCountriesInput) => ({
    editionId: requireId(data?.editionId, "Edition"),
    showId: requireId(data?.showId, "Show"),
    countryIds: Array.isArray(data?.countryIds)
      ? [...new Set(data.countryIds.filter((value): value is string => typeof value === "string" && Boolean(value.trim())).map((value) => value.trim()))]
      : [],
    operationId: optionalId(data?.operationId),
    idempotencyKey: optionalId(data?.idempotencyKey),
  }))
  .handler(async ({ data }): Promise<AddCountriesToShowResult> => {
    const result = await runShowLineupOperation({
      editionId: data.editionId,
      showId: data.showId,
      action: "sync_confirmed_countries",
      payload: { countryIds: data.countryIds },
      operationId: data.operationId,
      idempotencyKey: data.idempotencyKey,
      reason: "Synchronize canonical confirmed delegations into this show",
    });
    return { ...result, countryIds: data.countryIds };
  });
