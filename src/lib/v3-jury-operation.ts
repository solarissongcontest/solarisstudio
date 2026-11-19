export type V3JuryOperationStatus = "ready" | "dispatched" | "uncertain";

export type V3JuryOperationScope = {
  actorId: string;
  countryId: string;
  showId: string;
};

export type V3JuryOperation = V3JuryOperationScope & {
  version: 2;
  operationId: string;
  ballotFingerprint: string;
  status: V3JuryOperationStatus;
  createdAt: string;
  updatedAt: string;
};

function validate(operation: V3JuryOperation) {
  if (
    operation.version !== 2 ||
    !operation.actorId ||
    !operation.countryId ||
    !operation.showId ||
    !operation.operationId ||
    !operation.ballotFingerprint ||
    !Number.isFinite(Date.parse(operation.createdAt)) ||
    !Number.isFinite(Date.parse(operation.updatedAt))
  ) {
    throw new Error("Invalid Jury operation state");
  }
}

export function sameV3JuryOperationScope(
  left: V3JuryOperationScope,
  right: V3JuryOperationScope,
) {
  return left.actorId === right.actorId &&
    left.countryId === right.countryId &&
    left.showId === right.showId;
}

export function prepareV3JuryOperation(input: V3JuryOperationScope & {
  existing: V3JuryOperation | null;
  ballotFingerprint: string;
  newOperationId: string;
  now: string;
}) {
  if (input.existing) validate(input.existing);
  if (
    input.existing?.status === "uncertain" &&
    sameV3JuryOperationScope(input.existing, input) &&
    input.existing.ballotFingerprint === input.ballotFingerprint
  ) {
    return { operation: input.existing, reused: true as const };
  }
  const operation: V3JuryOperation = {
    version: 2,
    actorId: input.actorId,
    countryId: input.countryId,
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

// v1 persisted only a show-scoped operation. It is never trusted as an
// actor-scoped retry, since another delegation could have used this browser.
const storageKey = (scope: V3JuryOperationScope) =>
  `ssc.v3.jury.operation.v2.${scope.actorId}.${scope.countryId}.${scope.showId}`;

export function readV3JuryOperation(scope: V3JuryOperationScope): V3JuryOperation | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as V3JuryOperation;
    validate(parsed);
    return sameV3JuryOperationScope(parsed, scope) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeV3JuryOperation(operation: V3JuryOperation) {
  if (typeof window === "undefined") return;
  validate(operation);
  try {
    window.localStorage.setItem(storageKey(operation), JSON.stringify(operation));
  } catch {
    // The in-memory operation still protects this page lifetime. Never mint a
    // replacement id merely because browser storage is unavailable.
  }
}

export function clearV3JuryOperation(scope: V3JuryOperationScope) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(scope));
  } catch {
    // Receipt authority is server-side; cleanup is best effort only.
  }
}
