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

function validateScope(scope: V3JuryOperationScope) {
  if (
    typeof scope.actorId !== "string" || !scope.actorId.trim() || scope.actorId === "anonymous" ||
    typeof scope.countryId !== "string" || !scope.countryId.trim() ||
    typeof scope.showId !== "string" || !scope.showId.trim()
  ) {
    throw new Error("Jury operation requires a signed-in actor, country and show");
  }
}

function validate(operation: V3JuryOperation) {
  validateScope(operation);
  if (
    operation.version !== 2 ||
    typeof operation.operationId !== "string" || !operation.operationId.trim() ||
    typeof operation.ballotFingerprint !== "string" || !operation.ballotFingerprint ||
    !["ready", "dispatched", "uncertain"].includes(operation.status) ||
    !Number.isFinite(Date.parse(operation.createdAt)) ||
    !Number.isFinite(Date.parse(operation.updatedAt))
  ) {
    throw new Error("Invalid Jury operation state");
  }
}

export function prepareV3JuryOperation(input: {
  existing: V3JuryOperation | null;
  actorId: string;
  countryId: string;
  showId: string;
  ballotFingerprint: string;
  newOperationId: string;
  now: string;
}) {
  validateScope(input);
  if (input.existing) validate(input.existing);
  if (
    input.existing?.status === "uncertain" &&
    input.existing.actorId === input.actorId &&
    input.existing.countryId === input.countryId &&
    input.existing.showId === input.showId &&
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

function storageKey(scope: V3JuryOperationScope) {
  validateScope(scope);
  // Length-prefixed segments avoid collisions for unusual identifier content.
  // Never adopt the old show-only V1 key without server-side owner proof.
  const segment = (value: string) => `${value.length}:${value}`;
  return `ssc.v3.jury.operation.v2.${segment(scope.actorId)}:${segment(scope.countryId)}:${segment(scope.showId)}`;
}

export function readV3JuryOperation(scope: V3JuryOperationScope): V3JuryOperation | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as V3JuryOperation;
    validate(parsed);
    return parsed.actorId === scope.actorId && parsed.countryId === scope.countryId && parsed.showId === scope.showId
      ? parsed
      : null;
  } catch {
    // Invalid/old records cannot be safely attributed to the signed-in owner.
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
