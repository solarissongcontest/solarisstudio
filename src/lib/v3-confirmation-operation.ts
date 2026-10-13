export type V3ConfirmationOperationStatus =
  | "ready"
  | "dispatched"
  | "uncertain";

export type V3ConfirmationOperation = {
  version: 1;
  roundId: string;
  browserSessionId: string;
  idempotencyKey: string;
  clientPayloadFingerprint: string;
  status: V3ConfirmationOperationStatus;
  createdAt: string;
  updatedAt: string;
};

function requireNonEmpty(value: string, label: string) {
  if (!value.trim()) throw new Error(`${label} must not be empty`);
}

function requireIsoDate(value: string, label: string) {
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${label} must be an ISO timestamp`);
}

function validate(operation: V3ConfirmationOperation) {
  requireNonEmpty(operation.roundId, "roundId");
  requireNonEmpty(operation.browserSessionId, "browserSessionId");
  requireNonEmpty(operation.idempotencyKey, "idempotencyKey");
  requireNonEmpty(operation.clientPayloadFingerprint, "clientPayloadFingerprint");
  requireIsoDate(operation.createdAt, "createdAt");
  requireIsoDate(operation.updatedAt, "updatedAt");
}

export function createV3ConfirmationOperation(input: {
  roundId: string;
  browserSessionId: string;
  idempotencyKey: string;
  clientPayloadFingerprint: string;
  now: string;
}): V3ConfirmationOperation {
  const operation: V3ConfirmationOperation = {
    version: 1,
    roundId: input.roundId,
    browserSessionId: input.browserSessionId,
    idempotencyKey: input.idempotencyKey,
    clientPayloadFingerprint: input.clientPayloadFingerprint,
    status: "ready",
    createdAt: input.now,
    updatedAt: input.now,
  };
  validate(operation);
  return operation;
}

/**
 * Reuse an operation identity only when an ambiguous request is being retried
 * with the exact same client payload. The fingerprint is a client safety guard,
 * not receipt authority; Postgres independently hashes the logical request.
 */
export function prepareV3ConfirmationOperation(input: {
  existing: V3ConfirmationOperation | null;
  roundId: string;
  browserSessionId: string;
  clientPayloadFingerprint: string;
  newIdempotencyKey: string;
  now: string;
}) {
  const existing = input.existing;
  if (existing) validate(existing);

  if (
    existing?.status === "uncertain" &&
    existing.roundId === input.roundId &&
    existing.browserSessionId === input.browserSessionId &&
    existing.clientPayloadFingerprint === input.clientPayloadFingerprint
  ) {
    return { operation: existing, reused: true as const };
  }

  return {
    operation: createV3ConfirmationOperation({
      roundId: input.roundId,
      browserSessionId: input.browserSessionId,
      idempotencyKey: input.newIdempotencyKey,
      clientPayloadFingerprint: input.clientPayloadFingerprint,
      now: input.now,
    }),
    reused: false as const,
  };
}

export function markV3ConfirmationDispatched(
  operation: V3ConfirmationOperation,
  now: string,
): V3ConfirmationOperation {
  validate(operation);
  requireIsoDate(now, "now");
  if (operation.status !== "ready" && operation.status !== "uncertain") {
    throw new Error(`cannot dispatch confirmation from ${operation.status}`);
  }
  return { ...operation, status: "dispatched", updatedAt: now };
}

export function markV3ConfirmationUncertain(
  operation: V3ConfirmationOperation,
  now: string,
): V3ConfirmationOperation {
  validate(operation);
  requireIsoDate(now, "now");
  if (operation.status !== "dispatched") {
    throw new Error(`cannot mark confirmation uncertain from ${operation.status}`);
  }
  return { ...operation, status: "uncertain", updatedAt: now };
}

const operationStorageKey = (roundId: string) =>
  `ssc.v3.confirmation.operation.${roundId}`;

export function readV3ConfirmationOperation(
  roundId: string,
): V3ConfirmationOperation | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(operationStorageKey(roundId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as V3ConfirmationOperation;
    if (parsed.version !== 1 || parsed.roundId !== roundId) return null;
    validate(parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function writeV3ConfirmationOperation(operation: V3ConfirmationOperation) {
  if (typeof window === "undefined") return;
  validate(operation);
  try {
    window.localStorage.setItem(
      operationStorageKey(operation.roundId),
      JSON.stringify(operation),
    );
  } catch {
    // If browser storage is unavailable, the active in-memory operation can
    // still reconcile during this page lifetime. Never invent a replacement key.
  }
}

export function clearV3ConfirmationOperation(roundId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(operationStorageKey(roundId));
  } catch {
    // Best effort cleanup only; a confirmed receipt still remains authoritative.
  }
}
