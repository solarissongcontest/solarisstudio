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

function normalizeResult(
  value: unknown,
  request: JuryVoteCommandRequest,
  replayed: boolean,
): JuryVoteCommandResult {
  const result = asObject(value, "jury score result");
  const semantic = asObject(result.request, "verified jury score request");
  const fields = [
    "editionId",
    "showId",
    "voterId",
    "voterCountryId",
    "voterEntityId",
    "receivingCountryId",
    "receivingEntityId",
    "points",
    "action",
    "expectedVersion",
  ] as const;
  if (
    fields.some((key) => semantic[key] !== request[key]) ||
    result.operationId !== request.operationId ||
    result.action !== request.action ||
    result.showId !== request.showId ||
    result.points !== request.points ||
    result.previousVersion !== request.expectedVersion
  ) {
    throw new Error("Jury score receipt disagrees with the requested mutation.");
  }
  const version = result.version as number;
  const deletedRows = (result.deletedRows ?? 0) as number;
  const voteId = result.voteId ?? null;
  if (
    !Number.isSafeInteger(version) ||
    version < request.expectedVersion ||
    !Number.isSafeInteger(deletedRows) ||
    deletedRows < 0 ||
    (voteId !== null && (typeof voteId !== "string" || !voteId))
  )
    throw new Error("Invalid jury score receipt. Recover the saved change.");
  return {
    operationId: request.operationId,
    action: request.action,
    showId: request.showId,
    points: request.points,
    previousVersion: request.expectedVersion,
    version,
    deletedRows,
    voteId: voteId as string | null,
    replayed,
  };
}

function normalizeWireResult(value: unknown, request: JuryVoteCommandRequest) {
  const envelope = asObject(value, "jury score command response");
  if (envelope.status === "succeeded") {
    return normalizeResult(envelope.result, request, envelope.replayed === true);
  }
  throw new Error("Jury score operation did not return a successful receipt.");
}

/** A lost, thrown or malformed response is recovered through the same governed
 * command. Generic receipt readback cannot bypass fresh domain authorization. */
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
  return recoverJuryCommand(async () => {
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

    if (error) throw error;
    return normalizeWireResult(data, request);
  });
}

export function isDefiniteJuryRejection(error: unknown): boolean {
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  return (
    typeof code === "string" &&
    ["PT409", "40001", "22023", "23514", "55000", "P0002"].includes(code)
  );
}

/** A database rejection cannot commit this request. Authorization revocation
 * and fingerprint conflicts retain identity because earlier success may exist. */
export async function recoverJuryCommand<T>(attempt: () => Promise<T>): Promise<T> {
  try {
    return await attempt();
  } catch (original) {
    if (
      isDefiniteJuryRejection(original) ||
      (original && typeof original === "object" && "code" in original && original.code === "42501")
    )
      throw original;
    try {
      return await attempt();
    } catch {
      throw original;
    }
  }
}

export type JuryBallotReviewRequest = {
  editionId: string;
  showId: string;
  ballotId: string;
  targetStatus: "valid" | "needs_review" | "invalidated" | "superseded";
  reason: string | null;
  expectedVersion: number;
  operationId: string;
  idempotencyKey: string;
};
export async function executeJuryBallotReview(
  request: JuryBallotReviewRequest,
  client: JuryVoteRpcClient,
) {
  return recoverJuryCommand(async () => {
    const { data, error } = await client.rpc("studio2_apply_jury_ballot_review", {
      p_ballot_id: request.ballotId,
      p_target_status: request.targetStatus,
      p_reason: request.reason,
      p_expected_version: request.expectedVersion,
      p_operation_id: request.operationId,
      p_idempotency_key: request.idempotencyKey,
    });
    if (error) throw error;
    const result = asObject(data, "jury ballot review receipt");
    if (
      result.ok !== true ||
      result.operationId !== request.operationId ||
      result.ballotId !== request.ballotId ||
      result.editionId !== request.editionId ||
      result.showId !== request.showId ||
      result.status !== request.targetStatus ||
      result.reason !== request.reason ||
      result.previousVersion !== request.expectedVersion ||
      result.version !== request.expectedVersion + 1
    ) {
      throw new Error("Jury ballot review is unconfirmed. Recover the retained operation.");
    }
    return result;
  });
}
