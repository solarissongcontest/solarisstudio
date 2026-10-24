import { requireMergedTelevotingAdminServer } from "@/integrations/televoting/admin-session.server";
import { televotingAdmin } from "@/integrations/televoting/client.server";
import {
  recomputeResultIntegrityOperationServer,
  type ResultIntegrityRecomputeOperationInput,
} from "@/integrations/televoting/result-integrity.server";

type ResultIntegrityOperationResult = {
  ok: true;
  operationId: string;
  correlationId: string;
  solarisEditionId: string;
  roundId: string;
  calculationVersion: number;
  evidenceRevision: number;
  evidenceFingerprint: string;
  rowCount: number;
};

type ReplayLookup = {
  found: boolean;
  operationId?: string;
  correlationId?: string;
  status?: string;
  result?: unknown;
  error?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseOperationResult(value: unknown): ResultIntegrityOperationResult | null {
  if (!isRecord(value)) return null;
  if (
    value.ok !== true
    || typeof value.operationId !== "string"
    || typeof value.correlationId !== "string"
    || typeof value.solarisEditionId !== "string"
    || typeof value.roundId !== "string"
    || typeof value.calculationVersion !== "number"
    || typeof value.evidenceRevision !== "number"
    || typeof value.evidenceFingerprint !== "string"
    || typeof value.rowCount !== "number"
  ) {
    return null;
  }
  return value as ResultIntegrityOperationResult;
}

function parseReplayLookup(value: unknown): ReplayLookup {
  if (!isRecord(value) || typeof value.found !== "boolean") {
    throw new Error("Result Integrity replay lookup returned an invalid response");
  }
  if (!value.found) return { found: false };
  if (
    typeof value.operationId !== "string"
    || typeof value.correlationId !== "string"
    || typeof value.status !== "string"
  ) {
    throw new Error("Result Integrity replay lookup returned an invalid receipt");
  }
  return {
    found: true,
    operationId: value.operationId,
    correlationId: value.correlationId,
    status: value.status,
    result: value.result,
    error: value.error,
  };
}

async function lookupResultIntegrityReplay(
  command: ResultIntegrityRecomputeOperationInput,
): Promise<ResultIntegrityOperationResult | null> {
  const { data, error } = await televotingAdmin.rpc(
    "studio2_replay_result_integrity_recompute",
    {
      p_solaris_edition_id: command.editionId,
      p_round_id: command.roundId,
      p_expected_calculation_version: command.expectedCalculationVersion,
      p_operation_id: command.operationId,
      p_idempotency_key: command.idempotencyKey,
    },
  );

  if (error) throw new Error(error.message);
  const replay = parseReplayLookup(data);
  if (!replay.found) return null;

  if (replay.status !== "succeeded") {
    const errorCode = isRecord(replay.error) && typeof replay.error.code === "string"
      ? ` (${replay.error.code})`
      : "";
    throw new Error(`Result Integrity operation is ${replay.status}${errorCode}`);
  }

  const result = parseOperationResult(replay.result);
  if (!result) {
    throw new Error("Result Integrity replay receipt contains an invalid result");
  }
  return result;
}

/**
 * Canonical V3 lost-response boundary.
 *
 * The durable S2 receipt must be consulted before any mutable round/calculation
 * reads. Otherwise an exact retry can incorrectly fail after the round advances
 * even though the original Result Integrity operation committed successfully.
 */
export async function recomputeResultIntegrityOperationWithReplayServer(
  command: ResultIntegrityRecomputeOperationInput,
) {
  await requireMergedTelevotingAdminServer();

  const replay = await lookupResultIntegrityReplay(command);
  if (replay) {
    return {
      clustersAnalysed: replay.rowCount,
      detectedGroups: null,
      currentGroups: [],
      operation: replay,
      reconciled: true,
    };
  }

  return recomputeResultIntegrityOperationServer(command);
}
