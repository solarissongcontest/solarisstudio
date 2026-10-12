export type V3CriticalOperationKind =
  | "confirmation"
  | "entry"
  | "jury"
  | "televote"
  | "result-publication"
  | "organizer-transition";

export type V3OperationFailure = {
  code: string;
  message: string;
  retryable: boolean;
};

export type V3CriticalOperationState =
  | {
      phase: "idle";
      kind: V3CriticalOperationKind;
    }
  | {
      phase: "submitting";
      kind: V3CriticalOperationKind;
      operationId: string;
      idempotencyKey: string;
      startedAt: string;
    }
  | {
      phase: "uncertain";
      kind: V3CriticalOperationKind;
      operationId: string;
      idempotencyKey: string;
      startedAt: string;
      uncertainAt: string;
      reason: "transport" | "timeout" | "resume";
    }
  | {
      phase: "confirmed";
      kind: V3CriticalOperationKind;
      operationId: string;
      idempotencyKey: string;
      receiptId: string;
      confirmedAt: string;
      stateVersion: string | null;
    }
  | {
      phase: "rejected";
      kind: V3CriticalOperationKind;
      operationId: string;
      idempotencyKey: string;
      rejectedAt: string;
      failure: V3OperationFailure;
    }
  | {
      phase: "failed";
      kind: V3CriticalOperationKind;
      operationId: string;
      idempotencyKey: string;
      failedAt: string;
      failure: V3OperationFailure;
    };

export type V3CriticalOperationEvent =
  | {
      type: "begin";
      operationId: string;
      idempotencyKey: string;
      at: string;
    }
  | {
      type: "transport-uncertain";
      at: string;
      reason: "transport" | "timeout" | "resume";
    }
  | {
      type: "confirmed";
      receiptId: string;
      at: string;
      stateVersion?: string | null;
    }
  | {
      type: "rejected";
      at: string;
      failure: V3OperationFailure;
    }
  | {
      type: "failed";
      at: string;
      failure: V3OperationFailure;
    }
  | {
      type: "reset";
    };

export class V3CriticalOperationTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "V3CriticalOperationTransitionError";
  }
}

function requireActiveOperation(
  state: V3CriticalOperationState,
): Exclude<V3CriticalOperationState, { phase: "idle" }> {
  if (state.phase === "idle") {
    throw new V3CriticalOperationTransitionError(
      "Critical operation has not started. Begin it before applying a server result.",
    );
  }
  return state;
}

function operationIdentity(
  state: Exclude<V3CriticalOperationState, { phase: "idle" }>,
) {
  return {
    operationId: state.operationId,
    idempotencyKey: state.idempotencyKey,
  };
}

/**
 * Pure client-side state machine for critical V3 mutations.
 *
 * It does not perform the mutation. Its job is to make unsafe UI states hard to
 * represent: a transport timeout becomes `uncertain`, success exists only after
 * an authoritative confirmation, and confirmed operations cannot be silently
 * restarted. Callers must reconcile `uncertain` operations using the same
 * operation/idempotency identity before retrying.
 */
export function transitionV3CriticalOperation(
  state: V3CriticalOperationState,
  event: V3CriticalOperationEvent,
): V3CriticalOperationState {
  if (event.type === "reset") {
    if (state.phase === "submitting" || state.phase === "uncertain") {
      throw new V3CriticalOperationTransitionError(
        "Do not reset an in-flight or uncertain critical operation before reconciliation.",
      );
    }
    return { phase: "idle", kind: state.kind };
  }

  if (event.type === "begin") {
    if (state.phase === "submitting" || state.phase === "uncertain") {
      throw new V3CriticalOperationTransitionError(
        "A critical operation is already in progress and must be reconciled before retrying.",
      );
    }
    if (state.phase === "confirmed") {
      throw new V3CriticalOperationTransitionError(
        "A confirmed critical operation cannot be submitted again without an explicit reset/new workflow.",
      );
    }

    return {
      phase: "submitting",
      kind: state.kind,
      operationId: event.operationId,
      idempotencyKey: event.idempotencyKey,
      startedAt: event.at,
    };
  }

  const active = requireActiveOperation(state);

  if (event.type === "transport-uncertain") {
    if (active.phase !== "submitting") {
      throw new V3CriticalOperationTransitionError(
        "Only an actively submitting operation can become transport-uncertain.",
      );
    }

    return {
      phase: "uncertain",
      kind: active.kind,
      ...operationIdentity(active),
      startedAt: active.startedAt,
      uncertainAt: event.at,
      reason: event.reason,
    };
  }

  if (event.type === "confirmed") {
    if (active.phase === "confirmed") return active;
    if (active.phase === "rejected" || active.phase === "failed") {
      throw new V3CriticalOperationTransitionError(
        "A terminal failed/rejected operation cannot later become confirmed without a new authoritative reconciliation cycle.",
      );
    }

    return {
      phase: "confirmed",
      kind: active.kind,
      ...operationIdentity(active),
      receiptId: event.receiptId,
      confirmedAt: event.at,
      stateVersion: event.stateVersion ?? null,
    };
  }

  if (event.type === "rejected") {
    if (active.phase === "confirmed") {
      throw new V3CriticalOperationTransitionError(
        "A confirmed critical operation cannot be rejected locally.",
      );
    }

    return {
      phase: "rejected",
      kind: active.kind,
      ...operationIdentity(active),
      rejectedAt: event.at,
      failure: event.failure,
    };
  }

  if (active.phase === "confirmed") {
    throw new V3CriticalOperationTransitionError(
      "A confirmed critical operation cannot be failed locally.",
    );
  }

  return {
    phase: "failed",
    kind: active.kind,
    ...operationIdentity(active),
    failedAt: event.at,
    failure: event.failure,
  };
}

export function v3CriticalOperationNeedsReconciliation(state: V3CriticalOperationState) {
  return state.phase === "uncertain";
}

export function v3CriticalOperationCanRetry(state: V3CriticalOperationState) {
  return (
    (state.phase === "failed" || state.phase === "rejected") && state.failure.retryable
  );
}

export function v3CriticalOperationIsBusy(state: V3CriticalOperationState) {
  return state.phase === "submitting" || state.phase === "uncertain";
}

export function v3CriticalOperationUserMessage(state: V3CriticalOperationState) {
  switch (state.phase) {
    case "idle":
      return null;
    case "submitting":
      return "Submitting…";
    case "uncertain":
      return "Checking whether your submission was received…";
    case "confirmed":
      return "Submitted";
    case "rejected":
    case "failed":
      return state.failure.message;
  }
}
