import { supabase } from "@/integrations/supabase/client";
import { createSystemCommand } from "@/lib/system-operation-contract";

export type TelevoteAggregateTotal = {
  participantId: string;
  countryId: string | null;
  contestEntityId: string | null;
  points: number;
};

export type TelevoteAggregateSnapshot = {
  editionId: string;
  showId: string;
  version: number;
  stateHash: string;
  stateVersion: string;
  totals: TelevoteAggregateTotal[];
  resultsProtected: boolean;
  serverTime: string;
};

export type TelevoteAggregateChange = {
  participantId: string;
  points: number;
};

export type TelevoteAggregateUpdateResult = {
  ok: true;
  command: "televote.aggregate.update";
  operationId: string;
  receiptId: string;
  correlationId: string;
  editionId: string;
  showId: string;
  version: number;
  stateHash: string;
  stateVersion: string;
  appliedCount: number;
  totals: TelevoteAggregateTotal[];
  resultsRecalculationRequired: true;
  serverTime: string;
  replayed: boolean;
};

type OperationReceipt = {
  operationId: string;
  status: "processing" | "succeeded" | "failed" | "uncertain";
  result?: TelevoteAggregateUpdateResult | null;
};

function object(value: unknown, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} returned an invalid response.`);
  }
  return value as Record<string, unknown>;
}

function parseTotal(value: unknown): TelevoteAggregateTotal {
  const row = object(value, "Televote aggregate total");
  if (
    typeof row.participantId !== "string"
    || (row.countryId !== null && typeof row.countryId !== "string")
    || (row.contestEntityId !== null && typeof row.contestEntityId !== "string")
    || typeof row.points !== "number"
    || !Number.isSafeInteger(row.points)
  ) {
    throw new Error("Televote aggregate total contained invalid canonical data.");
  }
  return {
    participantId: row.participantId,
    countryId: row.countryId as string | null,
    contestEntityId: row.contestEntityId as string | null,
    points: row.points,
  };
}

function parseSnapshot(value: unknown): TelevoteAggregateSnapshot {
  const data = object(value, "Televote aggregate snapshot");
  if (
    typeof data.editionId !== "string"
    || typeof data.showId !== "string"
    || typeof data.version !== "number"
    || !Number.isSafeInteger(data.version)
    || data.version < 0
    || typeof data.stateHash !== "string"
    || !data.stateHash
    || typeof data.stateVersion !== "string"
    || !Array.isArray(data.totals)
    || typeof data.resultsProtected !== "boolean"
    || typeof data.serverTime !== "string"
  ) {
    throw new Error("Televote aggregate snapshot returned incomplete canonical state.");
  }
  return {
    editionId: data.editionId,
    showId: data.showId,
    version: data.version,
    stateHash: data.stateHash,
    stateVersion: data.stateVersion,
    totals: data.totals.map(parseTotal),
    resultsProtected: data.resultsProtected,
    serverTime: data.serverTime,
  };
}

function parseResult(value: unknown): TelevoteAggregateUpdateResult {
  const data = object(value, "Televote aggregate command");
  if (
    data.ok !== true
    || data.command !== "televote.aggregate.update"
    || typeof data.operationId !== "string"
    || typeof data.receiptId !== "string"
    || typeof data.correlationId !== "string"
    || typeof data.editionId !== "string"
    || typeof data.showId !== "string"
    || typeof data.version !== "number"
    || !Number.isSafeInteger(data.version)
    || typeof data.stateHash !== "string"
    || typeof data.stateVersion !== "string"
    || typeof data.appliedCount !== "number"
    || !Number.isSafeInteger(data.appliedCount)
    || !Array.isArray(data.totals)
    || data.resultsRecalculationRequired !== true
    || typeof data.serverTime !== "string"
    || typeof data.replayed !== "boolean"
  ) {
    throw new Error("Televote aggregate command returned incomplete receipt state.");
  }
  return {
    ok: true,
    command: "televote.aggregate.update",
    operationId: data.operationId,
    receiptId: data.receiptId,
    correlationId: data.correlationId,
    editionId: data.editionId,
    showId: data.showId,
    version: data.version,
    stateHash: data.stateHash,
    stateVersion: data.stateVersion,
    appliedCount: data.appliedCount,
    totals: data.totals.map(parseTotal),
    resultsRecalculationRequired: true,
    serverTime: data.serverTime,
    replayed: data.replayed,
  };
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await (supabase.rpc as any)(name, args);
  if (error) throw error;
  return data as T;
}

export async function getTelevoteAggregateSnapshot(input: { editionId: string; showId: string }) {
  const snapshot = parseSnapshot(await rpc<unknown>("studio2_televote_aggregate_snapshot", {
    p_show_id: input.showId,
    p_edition_id: input.editionId,
  }));
  if (snapshot.editionId !== input.editionId || snapshot.showId !== input.showId) {
    throw Object.assign(new Error("Televote aggregate authority returned a different edition/show scope."), { status: 409 });
  }
  return snapshot;
}

export function createTelevoteAggregateCommand(input: {
  editionId: string;
  showId: string;
  snapshot: TelevoteAggregateSnapshot;
  changes: TelevoteAggregateChange[];
  reason: string;
}) {
  return createSystemCommand({
    command: "televote.aggregate.update",
    editionId: input.editionId,
    showId: input.showId,
    subjectType: "show",
    subjectId: input.showId,
    expectedVersion: input.snapshot.stateVersion,
    reason: input.reason,
    payload: {
      version: input.snapshot.version,
      stateHash: input.snapshot.stateHash,
      changes: input.changes,
    },
  });
}

export async function applyTelevoteAggregateCommand(input: {
  editionId: string;
  showId: string;
  snapshot: TelevoteAggregateSnapshot;
  changes: TelevoteAggregateChange[];
  reason: string;
  operationId: string;
  idempotencyKey: string;
  correlationId: string;
}): Promise<TelevoteAggregateUpdateResult> {
  let originalError: unknown;
  try {
    const result = parseResult(await rpc<unknown>("studio2_update_televote_aggregate_totals", {
      p_show_id: input.showId,
      p_edition_id: input.editionId,
      p_expected_version: input.snapshot.version,
      p_expected_state_hash: input.snapshot.stateHash,
      p_changes: input.changes,
      p_reason: input.reason,
      p_operation_id: input.operationId,
      p_idempotency_key: input.idempotencyKey,
      p_correlation_id: input.correlationId,
    }));
    return result;
  } catch (caught) {
    originalError = caught;
  }

  // Never blindly repeat an ambiguous critical write. Reconcile the exact
  // durable operation first; a clean domain/CAS failure simply rethrows below.
  try {
    const receipt = await rpc<OperationReceipt>("studio2_reconcile_operation", {
      p_operation_id: input.operationId,
    });
    if (receipt.status === "succeeded" && receipt.result) {
      return parseResult({ ...receipt.result, replayed: true });
    }
    if (receipt.status === "processing" || receipt.status === "uncertain") {
      throw Object.assign(
        new Error("Televote totals have an uncertain operation outcome. Refresh canonical state before another operation."),
        { status: 409, operationId: input.operationId },
      );
    }
  } catch (reconcileError) {
    if (reconcileError instanceof Error && reconcileError.message.includes("uncertain operation outcome")) {
      throw reconcileError;
    }
  }

  throw originalError;
}
