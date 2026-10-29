export type JuryVoteAction = "assign" | "clear";

export type JuryVoteCommandRequest = {
  editionId: string;
  showId: string;
  voterId: string | null;
  voterCountryId: string | null;
  voterEntityId: string | null;
  receivingCountryId: string | null;
  receivingEntityId: string | null;
  points: number;
  action: JuryVoteAction;
  expectedVersion: number;
  operationId: string;
  idempotencyKey: string;
};

export type JuryVoteCommandResult = {
  operationId: string;
  action: JuryVoteAction;
  showId: string;
  points: number;
  previousVersion: number;
  version: number;
  voteId: string | null;
  deletedRows: number;
  replayed: boolean;
};

type RpcResult = PromiseLike<{ data: unknown; error: unknown }>;
export type JuryVoteRpcClient = {
  rpc(name: string, args?: Record<string, unknown>): RpcResult;
};

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${label}: expected an object.`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) throw new Error(`Invalid ${label}.`);
  return value;
}

function asInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid ${label}.`);
  }
  return value;
}

function normalizeResult(
  value: unknown,
  request: JuryVoteCommandRequest,
  replayed: boolean,
): JuryVoteCommandResult {
  const result = asObject(value, "jury score result");
  const operationId = asString(result.operationId, "jury score operation id");
  const action = asString(result.action, "jury score action") as JuryVoteAction;
  const showId = asString(result.showId, "jury score show id");
  const points = asInteger(result.points, "jury score points");
  const previousVersion = asInteger(result.previousVersion, "previous jury score version");
  const version = asInteger(result.version, "jury score version");
  const deletedRows = asInteger(result.deletedRows ?? 0, "deleted jury score rows");
  const voteId = result.voteId === null || result.voteId === undefined
    ? null
    : asString(result.voteId, "jury score vote id");

  if (operationId !== request.operationId) {
    throw new Error("Jury score receipt belongs to another operation.");
  }
  if (action !== request.action || showId !== request.showId || points !== request.points) {
    throw new Error("Jury score receipt disagrees with the requested mutation.");
  }
  if (previousVersion !== request.expectedVersion || version < previousVersion) {
    throw new Error("Jury score receipt disagrees with the reviewed score version.");
  }

  return {
    operationId,
    action,
    showId,
    points,
    previousVersion,
    version,
    voteId,
    deletedRows,
    replayed,
  };
}

function normalizeWireResult(value: unknown, request: JuryVoteCommandRequest) {
  const envelope = asObject(value, "jury score command response");
  if (envelope.status === "succeeded") {
    return normalizeResult(envelope.result, request, envelope.replayed === true);
  }
  if (envelope.result && typeof envelope.result === "object") {
    return normalizeResult(envelope.result, request, envelope.replayed === true);
  }
  throw new Error("Jury score operation did not return a successful receipt.");
}

/**
 * Executes one canonical manual jury-score mutation. A transport or RPC error is
 * reconciled exactly once by operation id before it is surfaced, so a response
 * lost after commit does not invite a blind second official mutation.
 */
export async function executeJuryVoteChange(
  request: JuryVoteCommandRequest,
  client: JuryVoteRpcClient,
): Promise<JuryVoteCommandResult> {
  if (!Number.isSafeInteger(request.expectedVersion) || request.expectedVersion < 0) {
    throw new Error("Refresh jury scores before editing this ballot.");
  }
  if (!request.operationId || !request.idempotencyKey) {
    throw new Error("Jury score mutation requires stable operation identity.");
  }

  const { data, error } = await client.rpc("studio2_apply_jury_vote_change", {
    p_edition_id: request.editionId,
    p_show_id: request.showId,
    p_voter_id: request.voterId,
    p_voter_country_id: request.voterCountryId,
    p_voter_entity_id: request.voterEntityId,
    p_receiving_country_id: request.receivingCountryId,
    p_receiving_entity_id: request.receivingEntityId,
    p_points: request.points,
    p_action: request.action,
    p_operation_id: request.operationId,
    p_idempotency_key: request.idempotencyKey,
    p_expected_version: request.expectedVersion,
  });

  if (!error) return normalizeWireResult(data, request);

  const { data: reconciliation, error: reconciliationError } = await client.rpc(
    "studio2_reconcile_operation",
    { p_operation_id: request.operationId },
  );

  if (!reconciliationError) {
    try {
      return normalizeWireResult(reconciliation, request);
    } catch {
      // The original mutation error stays authoritative if a receipt is absent,
      // malformed or contradicts the exact reviewed request.
    }
  }

  throw error;
}
