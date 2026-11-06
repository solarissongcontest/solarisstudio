export type V3JuryOperationStatus = "ready" | "dispatched" | "uncertain";

export type V3JuryOperationScope = {
  actorId: string;
  countryId: string;
  editionId: string;
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
    !operation.actorId || !operation.countryId || !operation.editionId ||
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
  scope: V3JuryOperationScope;
  ballotFingerprint: string;
  newOperationId: string;
  now: string;
}) {
  if (input.existing) validate(input.existing);
  if (
    (input.existing?.status === "uncertain" || input.existing?.status === "dispatched") &&
    input.existing.actorId === input.scope.actorId &&
    input.existing.countryId === input.scope.countryId &&
    input.existing.editionId === input.scope.editionId &&
    input.existing.showId === input.scope.showId &&
    input.existing.ballotFingerprint === input.ballotFingerprint
  ) {
    // A navigation during an in-flight request must not rotate the operation ID.
    const operation: V3JuryOperation = input.existing.status === "dispatched"
      ? { ...input.existing, status: "uncertain", updatedAt: input.now }
      : input.existing;
    return { operation, reused: true as const };
  }
  const operation: V3JuryOperation = {
    version: 2,
    ...input.scope,
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

const storageKey = (scope: V3JuryOperationScope) =>
  "ssc.v3.jury.operation.v2." +
  [scope.actorId, scope.countryId, scope.editionId, scope.showId].map(encodeURIComponent).join(":");
const legacyStorageKey = (showId: string) => `ssc.v3.jury.operation.${showId}`;

type LegacyV3JuryOperation = Pick<V3JuryOperation, "showId" | "operationId" | "ballotFingerprint" | "status" | "createdAt" | "updatedAt"> & { version: 1 };

export function readLegacyV3JuryOperation(showId: string): LegacyV3JuryOperation | null {
  if (typeof window === "undefined" || !showId) return null;
  try {
    const raw = window.localStorage.getItem(legacyStorageKey(showId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LegacyV3JuryOperation;
    if (!parsed || parsed.version !== 1 || parsed.showId !== showId ||
        !parsed.operationId || !parsed.ballotFingerprint ||
        !["uncertain", "dispatched"].includes(parsed.status) ||
        !Number.isFinite(Date.parse(parsed.createdAt)) ||
        !Number.isFinite(Date.parse(parsed.updatedAt))) return null;
    // This unscoped ID is NEVER submitted as a new mutation. It may only be
    // checked via actor-authorized v3_reconcile_jury_submission.
    return parsed;
  } catch { return null; }
}

export function clearLegacyV3JuryOperation(showId: string) {
  if (typeof window === "undefined" || !showId) return;
  try { window.localStorage.removeItem(legacyStorageKey(showId)); }
  catch { /* Best-effort cleanup; server receipt is authoritative. */ }
}

export function readV3JuryOperation(scope: V3JuryOperationScope): V3JuryOperation | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as V3JuryOperation;
    validate(parsed);
    return parsed.actorId === scope.actorId &&
      parsed.countryId === scope.countryId &&
      parsed.editionId === scope.editionId &&
      parsed.showId === scope.showId ? parsed : null;
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
