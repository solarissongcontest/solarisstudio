export type V3DraftSyncState =
  | "synced"
  | "local_ahead"
  | "server_ahead"
  | "offline_local"
  | "conflict";

export type V3DraftConflictReason =
  | "stale_revision"
  | "future_revision"
  | "draft_mismatch";

export type V3VersionedDraft<T> = {
  draftId: string;
  /**
   * The latest local revision. Local-only edits may move this ahead of
   * serverRevision without claiming that the server saved anything.
   */
  revision: number;
  /** The newest authoritative server revision this client has observed. */
  serverRevision: number;
  updatedAt: string;
  deviceId: string | null;
  sessionId: string | null;
  value: T;
  /** Last server-accepted operation, useful for diagnostics and future adapters. */
  lastOperationId: string | null;
};

export type V3DraftSaveCommand<T> = {
  operationId: string;
  draftId: string;
  /** Optimistic-concurrency precondition. */
  baseRevision: number;
  clientRevision: number;
  clientUpdatedAt: string;
  deviceId: string | null;
  sessionId: string | null;
  value: T;
};

export type V3DraftSaveAccepted<T> = {
  status: "accepted";
  operationId: string;
  previousRevision: number;
  draft: V3VersionedDraft<T>;
};

export type V3DraftSaveConflict<T> = {
  status: "conflict";
  operationId: string;
  reason: V3DraftConflictReason;
  attemptedBaseRevision: number;
  serverDraft: V3VersionedDraft<T>;
};

export type V3DraftSaveResult<T> =
  | V3DraftSaveAccepted<T>
  | V3DraftSaveConflict<T>;

export type V3DraftReconciliation<T> = {
  state: V3DraftSyncState;
  localDraft: V3VersionedDraft<T>;
  serverDraft: V3VersionedDraft<T> | null;
  reason: string;
};

function assertRevision(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
}

function assertIdentifier(value: string, label: string) {
  if (!value.trim()) throw new Error(`${label} must not be empty`);
}

function assertAuthoritativeServerDraft<T>(draft: V3VersionedDraft<T>) {
  assertRevision(draft.revision, "revision");
  assertRevision(draft.serverRevision, "serverRevision");
  if (draft.revision !== draft.serverRevision) {
    throw new Error(
      "serverDraft must be authoritative: revision and serverRevision must match",
    );
  }
}

export function createV3VersionedDraft<T>(input: {
  draftId: string;
  value: T;
  updatedAt: string;
  deviceId?: string | null;
  sessionId?: string | null;
  revision?: number;
  lastOperationId?: string | null;
}): V3VersionedDraft<T> {
  assertIdentifier(input.draftId, "draftId");
  const revision = input.revision ?? 0;
  assertRevision(revision, "revision");

  return {
    draftId: input.draftId,
    revision,
    serverRevision: revision,
    updatedAt: input.updatedAt,
    deviceId: input.deviceId ?? null,
    sessionId: input.sessionId ?? null,
    value: input.value,
    lastOperationId: input.lastOperationId ?? null,
  };
}

/**
 * Record an edit locally without claiming server acknowledgement.
 *
 * This deliberately advances `revision` only. `serverRevision` remains the
 * last canonical revision observed from the server, which makes offline and
 * multi-device conflict detection possible later.
 */
export function editV3DraftLocally<T>(
  draft: V3VersionedDraft<T>,
  input: {
    value: T;
    updatedAt: string;
    deviceId?: string | null;
    sessionId?: string | null;
  },
): V3VersionedDraft<T> {
  assertRevision(draft.revision, "revision");
  assertRevision(draft.serverRevision, "serverRevision");

  return {
    ...draft,
    revision: draft.revision + 1,
    serverRevision: draft.serverRevision,
    updatedAt: input.updatedAt,
    deviceId: input.deviceId ?? draft.deviceId,
    sessionId: input.sessionId ?? draft.sessionId,
    value: input.value,
  };
}

export function buildV3DraftSaveCommand<T>(
  draft: V3VersionedDraft<T>,
  operationId: string,
): V3DraftSaveCommand<T> {
  assertIdentifier(operationId, "operationId");
  assertRevision(draft.revision, "revision");
  assertRevision(draft.serverRevision, "serverRevision");

  return {
    operationId,
    draftId: draft.draftId,
    baseRevision: draft.serverRevision,
    clientRevision: draft.revision,
    clientUpdatedAt: draft.updatedAt,
    deviceId: draft.deviceId,
    sessionId: draft.sessionId,
    value: draft.value,
  };
}

/**
 * Pure reference implementation for the server-side revision precondition.
 *
 * A persistence adapter must execute the equivalent comparison and write in a
 * single transaction/conditional update. This helper intentionally performs
 * no database or network work itself.
 *
 * This helper also intentionally does NOT claim operation-id idempotency.
 * A real adapter may add that, but only if it stores enough operation metadata
 * to prove that a retried operation has the same payload.
 */
export function applyV3DraftSave<T>(
  serverDraft: V3VersionedDraft<T>,
  command: V3DraftSaveCommand<T>,
  serverTime: string,
): V3DraftSaveResult<T> {
  assertIdentifier(command.operationId, "operationId");
  assertIdentifier(command.draftId, "draftId");
  assertAuthoritativeServerDraft(serverDraft);
  assertRevision(command.baseRevision, "baseRevision");
  assertRevision(command.clientRevision, "clientRevision");

  if (serverDraft.draftId !== command.draftId) {
    return {
      status: "conflict",
      operationId: command.operationId,
      reason: "draft_mismatch",
      attemptedBaseRevision: command.baseRevision,
      serverDraft,
    };
  }

  if (command.baseRevision < serverDraft.serverRevision) {
    return {
      status: "conflict",
      operationId: command.operationId,
      reason: "stale_revision",
      attemptedBaseRevision: command.baseRevision,
      serverDraft,
    };
  }

  if (command.baseRevision > serverDraft.serverRevision) {
    return {
      status: "conflict",
      operationId: command.operationId,
      reason: "future_revision",
      attemptedBaseRevision: command.baseRevision,
      serverDraft,
    };
  }

  const nextRevision = serverDraft.serverRevision + 1;
  const nextDraft: V3VersionedDraft<T> = {
    draftId: serverDraft.draftId,
    revision: nextRevision,
    serverRevision: nextRevision,
    // Server time is canonical. A client timestamp is useful metadata for
    // diagnostics but must never determine authoritative ordering.
    updatedAt: serverTime,
    deviceId: command.deviceId,
    sessionId: command.sessionId,
    value: command.value,
    lastOperationId: command.operationId,
  };

  return {
    status: "accepted",
    operationId: command.operationId,
    previousRevision: serverDraft.serverRevision,
    draft: nextDraft,
  };
}

export function reconcileV3Draft<T>(
  localDraft: V3VersionedDraft<T>,
  serverDraft: V3VersionedDraft<T> | null,
  online: boolean,
): V3DraftReconciliation<T> {
  assertRevision(localDraft.revision, "revision");
  assertRevision(localDraft.serverRevision, "serverRevision");

  const hasLocalChanges = localDraft.revision > localDraft.serverRevision;

  if (!online) {
    return {
      state: hasLocalChanges ? "offline_local" : "synced",
      localDraft,
      serverDraft,
      reason: hasLocalChanges
        ? "Local edits are preserved, but no server acknowledgement is claimed while offline."
        : "No unsynced local edits are present.",
    };
  }

  if (!serverDraft) {
    return {
      state: hasLocalChanges ? "local_ahead" : "synced",
      localDraft,
      serverDraft: null,
      reason: hasLocalChanges
        ? "Local edits exist and no newer server draft was supplied."
        : "No server comparison is required for an unchanged local draft.",
    };
  }

  if (localDraft.draftId !== serverDraft.draftId) {
    return {
      state: "conflict",
      localDraft,
      serverDraft,
      reason: "The local and server drafts have different draft IDs.",
    };
  }

  assertAuthoritativeServerDraft(serverDraft);

  const serverAdvanced = serverDraft.serverRevision > localDraft.serverRevision;

  if (serverAdvanced && hasLocalChanges) {
    return {
      state: "conflict",
      localDraft,
      serverDraft,
      reason:
        "This draft changed on the server after the local device began editing. Review the newest version before saving.",
    };
  }

  if (serverAdvanced) {
    return {
      state: "server_ahead",
      localDraft,
      serverDraft,
      reason: "A newer server revision is available.",
    };
  }

  if (hasLocalChanges) {
    return {
      state: "local_ahead",
      localDraft,
      serverDraft,
      reason: "Local edits are newer than the last acknowledged server revision.",
    };
  }

  return {
    state: "synced",
    localDraft,
    serverDraft,
    reason: "Local and server revision knowledge is synchronized.",
  };
}
