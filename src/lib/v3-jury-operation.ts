export type V3JuryOperationStatus = "ready" | "dispatched" | "uncertain";

export type V3JuryOperation = {
  version: 1;
  showId: string;
  operationId: string;
  ballotFingerprint: string;
  status: V3JuryOperationStatus;
  createdAt: string;
  updatedAt: string;
};

function validate(operation: V3JuryOperation) {
  if (
    operation.version !== 1 ||
    !operation.showId ||
    !operation.operationId ||
    !operation.ballotFingerprint ||
    !Number.isFinite(Date.parse(operation.createdAt)) ||
    !Number.isFinite(Date.parse(operation.updatedAt))
  ) {
    throw new Error("Invalid Jury operation state");
  }
}

export function prepareV3JuryOperation(input: {
  existing: V3JuryOperation | null;
  showId: string;
  ballotFingerprint: string;
  newOperationId: string;
  now: string;
}) {
  if (input.existing) validate(input.existing);
  if (
    input.existing?.status === "uncertain" &&
    input.existing.showId === input.showId &&
    input.existing.ballotFingerprint === input.ballotFingerprint
  ) {
    return { operation: input.existing, reused: true as const };
  }
  const operation: V3JuryOperation = {
    version: 1,
    showId: input.showId,
    operationId: input.newOperationId,
    ballotFingerprint: input.ballotFingerprint,
    status: "ready",
    createdAt: input.now,
    updatedAt: input.now,
  };
  validate(operation);
  return { operation, reused: false as const };
}

export function updateV3JuryOperation(
  operation: V3JuryOperation,
  status: V3JuryOperationStatus,
  now: string,
) {
  validate(operation);
  const allowed =
    (status === "dispatched" &&
      (operation.status === "ready" || operation.status === "uncertain")) ||
    (status === "uncertain" && operation.status === "dispatched");
  if (!allowed) throw new Error(`Invalid Jury operation transition to ${status}`);
  const next = { ...operation, status, updatedAt: now };
  validate(next);
  return next;
}

const storageKey = (showId: string) => `ssc.v3.jury.operation.${showId}`;

export function readV3JuryOperation(showId: string): V3JuryOperation | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(showId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as V3JuryOperation;
    validate(parsed);
    return parsed.showId === showId ? parsed : null;
  } catch {
    return null;
  }
}

export function writeV3JuryOperation(operation: V3JuryOperation) {
  if (typeof window === "undefined") return;
  validate(operation);
  try {
    window.localStorage.setItem(storageKey(operation.showId), JSON.stringify(operation));
  } catch {
    // The in-memory operation still protects this page lifetime. Never mint a
    // replacement id merely because browser storage is unavailable.
  }
}

export function clearV3JuryOperation(showId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(showId));
  } catch {
    // Receipt authority is server-side; cleanup is best effort only.
  }
}
