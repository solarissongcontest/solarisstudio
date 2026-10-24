import { supabase } from "@/integrations/supabase/client";
import { createOrganisationCommand } from "@/lib/organisation-operation-contract";

export type AnniversaryDateSnapshot = {
  editionId: string;
  editionNumber: number | null;
  editionName: string;
  eventDate: string | null;
  year: number | null;
  serverTime: string;
};

export type AnniversaryDateOperation = {
  operationId: string;
  idempotencyKey: string;
  correlationId: string;
};

export type AnniversaryDateChangeRequest = {
  snapshot: AnniversaryDateSnapshot;
  eventDate: string | null;
  reason: string;
  operation: AnniversaryDateOperation;
};

export type AnniversaryDateChangeResult = {
  operationId: string;
  editionId: string;
  editionNumber: number | null;
  editionName: string;
  reason: string;
  before: {
    eventDate: string | null;
    year: number | null;
  };
  after: {
    eventDate: string | null;
    year: number | null;
  };
  serverTime: string;
  replayed: boolean;
};

type RpcResult = PromiseLike<{ data: unknown; error: unknown }>;
export type AnniversaryDateRpcClient = {
  rpc(name: string, args?: Record<string, unknown>): RpcResult;
};

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${label}: expected an object.`);
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid ${label}: expected a string.`);
  }
  return value;
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  return stringValue(value, label);
}

function nullableInteger(value: unknown, label: string): number | null {
  if (value === null) return null;
  if (!Number.isInteger(value)) {
    throw new Error(`Invalid ${label}: expected an integer or null.`);
  }
  return value as number;
}

function mapSnapshot(value: unknown): AnniversaryDateSnapshot {
  const row = objectValue(value, "Anniversary date snapshot");
  return {
    editionId: stringValue(row.editionId, "snapshot edition id"),
    editionNumber: nullableInteger(row.editionNumber, "snapshot edition number"),
    editionName: stringValue(row.editionName, "snapshot edition name"),
    eventDate: nullableString(row.eventDate, "snapshot event date"),
    year: nullableInteger(row.year, "snapshot year"),
    serverTime: stringValue(row.serverTime, "snapshot server time"),
  };
}

function expectedAfterYear(snapshot: AnniversaryDateSnapshot, eventDate: string | null) {
  if (!eventDate) return snapshot.year;
  const year = Number(eventDate.slice(0, 4));
  if (!Number.isInteger(year)) {
    throw new Error("Invalid Anniversary event date.");
  }
  return year;
}

function mapOperationResult(
  value: unknown,
  request: AnniversaryDateChangeRequest,
  replayed: boolean,
): AnniversaryDateChangeResult {
  const result = objectValue(value, "Anniversary date operation result");
  const before = objectValue(result.before, "Anniversary date before state");
  const after = objectValue(result.after, "Anniversary date after state");

  const mapped: AnniversaryDateChangeResult = {
    operationId: stringValue(result.operationId, "Anniversary operation id"),
    editionId: stringValue(result.editionId, "Anniversary edition id"),
    editionNumber: nullableInteger(result.editionNumber, "Anniversary edition number"),
    editionName: stringValue(result.editionName, "Anniversary edition name"),
    reason: stringValue(result.reason, "Anniversary change reason"),
    before: {
      eventDate: nullableString(before.eventDate, "Anniversary previous event date"),
      year: nullableInteger(before.year, "Anniversary previous year"),
    },
    after: {
      eventDate: nullableString(after.eventDate, "Anniversary resulting event date"),
      year: nullableInteger(after.year, "Anniversary resulting year"),
    },
    serverTime: stringValue(result.serverTime, "Anniversary result server time"),
    replayed,
  };

  const expectedReason = request.reason.trim();
  const expectedYear = expectedAfterYear(request.snapshot, request.eventDate);
  if (mapped.operationId !== request.operation.operationId) {
    throw new Error("Anniversary receipt belongs to a different operation.");
  }
  if (
    mapped.editionId !== request.snapshot.editionId ||
    mapped.editionNumber !== request.snapshot.editionNumber ||
    mapped.editionName !== request.snapshot.editionName
  ) {
    throw new Error("Anniversary receipt belongs to a different edition context.");
  }
  if (
    mapped.before.eventDate !== request.snapshot.eventDate ||
    mapped.before.year !== request.snapshot.year
  ) {
    throw new Error("Anniversary receipt disagrees with the reviewed baseline.");
  }
  if (mapped.after.eventDate !== request.eventDate || mapped.after.year !== expectedYear) {
    throw new Error("Anniversary receipt disagrees with the reviewed target date.");
  }
  if (mapped.reason !== expectedReason) {
    throw new Error("Anniversary receipt disagrees with the reviewed reason.");
  }

  return mapped;
}

function mapReceipt(
  value: unknown,
  request: AnniversaryDateChangeRequest,
): AnniversaryDateChangeResult | null {
  const receipt = objectValue(value, "Anniversary operation receipt");
  const operationId = stringValue(receipt.operationId, "Anniversary receipt operation id");
  if (operationId !== request.operation.operationId) {
    throw new Error("Anniversary reconciliation returned a different operation.");
  }
  if (receipt.status !== "succeeded" || receipt.result === null || receipt.result === undefined) {
    return null;
  }
  return mapOperationResult(receipt.result, request, receipt.replayed === true);
}

export function sameAnniversaryDateSnapshot(
  left: AnniversaryDateSnapshot,
  right: AnniversaryDateSnapshot,
) {
  return (
    left.editionId === right.editionId &&
    left.editionNumber === right.editionNumber &&
    left.editionName === right.editionName &&
    left.eventDate === right.eventDate &&
    left.year === right.year
  );
}

export async function loadAnniversaryDateSnapshot(
  editionId: string,
  client: AnniversaryDateRpcClient = supabase as unknown as AnniversaryDateRpcClient,
): Promise<AnniversaryDateSnapshot> {
  const { data, error } = await client.rpc("studio2_anniversary_date_snapshot", {
    p_edition_id: editionId,
  });
  if (error) throw error;
  const snapshot = mapSnapshot(data);
  if (snapshot.editionId !== editionId) {
    throw new Error("Anniversary snapshot returned a different edition.");
  }
  return snapshot;
}

export function createAnniversaryDateOperation(
  snapshot: AnniversaryDateSnapshot,
  eventDate: string | null,
): AnniversaryDateOperation {
  const command = createOrganisationCommand({
    command: "edition.anniversary_date.update",
    payload: {
      editionId: snapshot.editionId,
      eventDate,
      expectedEventDate: snapshot.eventDate,
      expectedYear: snapshot.year,
    },
    riskClass: "R2",
    scope: { editionId: snapshot.editionId },
  });
  return {
    operationId: command.operationId,
    idempotencyKey: command.idempotencyKey,
    correlationId: command.correlationId,
  };
}

/**
 * Commit one reviewed Anniversary date change through the canonical System
 * command. If the mutation transport fails, reconcile the exact operation once
 * before surfacing the original error. Never mint a second operation here.
 */
export async function applyAnniversaryDateChange(
  request: AnniversaryDateChangeRequest,
  client: AnniversaryDateRpcClient = supabase as unknown as AnniversaryDateRpcClient,
): Promise<AnniversaryDateChangeResult> {
  if (request.reason.trim().length < 5) {
    throw new Error("Explain the historical date change in at least 5 characters.");
  }
  if (!request.operation.operationId || !request.operation.idempotencyKey) {
    throw new Error("Anniversary date change requires stable operation identity.");
  }

  const args = {
    p_edition_id: request.snapshot.editionId,
    p_event_date: request.eventDate,
    p_expected_event_date: request.snapshot.eventDate,
    p_expected_year: request.snapshot.year,
    p_reason: request.reason.trim(),
    p_operation_id: request.operation.operationId,
    p_idempotency_key: request.operation.idempotencyKey,
    p_correlation_id: request.operation.correlationId,
  };
  const { data, error } = await client.rpc("studio2_set_anniversary_date", args);

  if (!error) {
    const receipt = mapReceipt(data, request);
    if (receipt) return receipt;
    throw new Error("Anniversary command did not return a completed receipt.");
  }

  const { data: reconciliation, error: reconciliationError } = await client.rpc(
    "studio2_reconcile_operation",
    { p_operation_id: request.operation.operationId },
  );
  if (!reconciliationError) {
    try {
      const reconciled = mapReceipt(reconciliation, request);
      if (reconciled) return { ...reconciled, replayed: true };
    } catch {
      // The original mutation error remains authoritative when reconciliation
      // is malformed or belongs to a different reviewed operation.
    }
  }

  throw error;
}
