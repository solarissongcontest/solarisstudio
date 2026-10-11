export type V3CriticalOperationStatus =
  | "in_progress"
  | "succeeded"
  | "failed_retryable"
  | "failed_final";

export type V3CriticalOperationScope = {
  actorId: string;
  action: string;
  contextKey: string;
};

export type V3CriticalOperationRequest = {
  idempotencyKey: string;
  requestHash: string;
  scope: V3CriticalOperationScope;
};

export type V3CriticalOperationRecord<TResult = unknown> = {
  idempotencyKey: string;
  requestHash: string;
  scope: V3CriticalOperationScope;
  status: V3CriticalOperationStatus;
  attempt: number;
  reservationToken: string;
  leaseExpiresAt: number | null;
  createdAt: number;
  updatedAt: number;
  receiptId: string | null;
  result: TResult | null;
  failureCode: string | null;
};

export type V3CriticalOperationDecision<TResult = unknown> =
  | {
      decision: "execute";
      record: V3CriticalOperationRecord<TResult>;
      reason: "new_operation" | "retryable_failure" | "expired_lease";
    }
  | {
      decision: "replay_success";
      record: V3CriticalOperationRecord<TResult>;
    }
  | {
      decision: "in_progress";
      record: V3CriticalOperationRecord<TResult>;
    }
  | {
      decision: "final_failure";
      record: V3CriticalOperationRecord<TResult>;
    }
  | {
      decision: "conflict";
      reason: "key_mismatch" | "scope_mismatch" | "payload_mismatch";
      record: V3CriticalOperationRecord<TResult>;
    };

export type V3CriticalOperationFinalizeResult<TResult = unknown> =
  | {
      status: "updated";
      record: V3CriticalOperationRecord<TResult>;
    }
  | {
      status: "stale_reservation";
      record: V3CriticalOperationRecord<TResult>;
    };

function requireNonEmpty(value: string, label: string) {
  if (!value.trim()) throw new Error(`${label} must not be empty`);
}

function requireSafePositiveInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive safe integer`);
  }
}

function requireServerTime(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("server time must be a finite non-negative number");
  }
}

function validateRequest(request: V3CriticalOperationRequest) {
  requireNonEmpty(request.idempotencyKey, "idempotencyKey");
  requireNonEmpty(request.requestHash, "requestHash");
  requireNonEmpty(request.scope.actorId, "scope.actorId");
  requireNonEmpty(request.scope.action, "scope.action");
  requireNonEmpty(request.scope.contextKey, "scope.contextKey");
}

function sameScope(
  left: V3CriticalOperationScope,
  right: V3CriticalOperationScope,
) {
  return (
    left.actorId === right.actorId &&
    left.action === right.action &&
    left.contextKey === right.contextKey
  );
}

function reserve<TResult>(input: {
  request: V3CriticalOperationRequest;
  previous: V3CriticalOperationRecord<TResult> | null;
  reservationToken: string;
  serverTime: number;
  leaseDurationMs: number;
}): V3CriticalOperationRecord<TResult> {
  requireNonEmpty(input.reservationToken, "reservationToken");
  requireSafePositiveInteger(input.leaseDurationMs, "leaseDurationMs");

  return {
    idempotencyKey: input.request.idempotencyKey,
    requestHash: input.request.requestHash,
    scope: input.request.scope,
    status: "in_progress",
    attempt: (input.previous?.attempt ?? 0) + 1,
    reservationToken: input.reservationToken,
    leaseExpiresAt: input.serverTime + input.leaseDurationMs,
    createdAt: input.previous?.createdAt ?? input.serverTime,
    updatedAt: input.serverTime,
    receiptId: input.previous?.receiptId ?? null,
    result: input.previous?.result ?? null,
    failureCode: null,
  };
}

/**
 * Pure reference transition for the server-side idempotency ledger.
 *
 * The persistence adapter must reserve the key and compare the existing record
 * atomically. Client-only storage, optimistic UI state, or an HTTP retry header
 * is not sufficient protection for critical Solaris mutations.
 */
export function beginV3CriticalOperation<TResult = unknown>(input: {
  existing: V3CriticalOperationRecord<TResult> | null;
  request: V3CriticalOperationRequest;
  reservationToken: string;
  serverTime: number;
  leaseDurationMs: number;
}): V3CriticalOperationDecision<TResult> {
  validateRequest(input.request);
  requireServerTime(input.serverTime);
  requireNonEmpty(input.reservationToken, "reservationToken");
  requireSafePositiveInteger(input.leaseDurationMs, "leaseDurationMs");

  if (!input.existing) {
    return {
      decision: "execute",
      reason: "new_operation",
      record: reserve({
        request: input.request,
        previous: null,
        reservationToken: input.reservationToken,
        serverTime: input.serverTime,
        leaseDurationMs: input.leaseDurationMs,
      }),
    };
  }

  if (input.existing.idempotencyKey !== input.request.idempotencyKey) {
    return {
      decision: "conflict",
      reason: "key_mismatch",
      record: input.existing,
    };
  }

  if (!sameScope(input.existing.scope, input.request.scope)) {
    return {
      decision: "conflict",
      reason: "scope_mismatch",
      record: input.existing,
    };
  }

  if (input.existing.requestHash !== input.request.requestHash) {
    return {
      decision: "conflict",
      reason: "payload_mismatch",
      record: input.existing,
    };
  }

  if (input.existing.status === "succeeded") {
    return { decision: "replay_success", record: input.existing };
  }

  if (input.existing.status === "failed_final") {
    return { decision: "final_failure", record: input.existing };
  }

  if (input.existing.status === "failed_retryable") {
    return {
      decision: "execute",
      reason: "retryable_failure",
      record: reserve({
        request: input.request,
        previous: input.existing,
        reservationToken: input.reservationToken,
        serverTime: input.serverTime,
        leaseDurationMs: input.leaseDurationMs,
      }),
    };
  }

  const leaseExpiresAt = input.existing.leaseExpiresAt;
  if (leaseExpiresAt != null && leaseExpiresAt <= input.serverTime) {
    return {
      decision: "execute",
      reason: "expired_lease",
      record: reserve({
        request: input.request,
        previous: input.existing,
        reservationToken: input.reservationToken,
        serverTime: input.serverTime,
        leaseDurationMs: input.leaseDurationMs,
      }),
    };
  }

  return { decision: "in_progress", record: input.existing };
}

function reservationMatches<TResult>(
  record: V3CriticalOperationRecord<TResult>,
  attempt: number,
  reservationToken: string,
  serverTime: number,
) {
  return (
    record.status === "in_progress" &&
    record.attempt === attempt &&
    record.reservationToken === reservationToken &&
    record.leaseExpiresAt != null &&
    serverTime < record.leaseExpiresAt
  );
}

export function succeedV3CriticalOperation<TResult>(input: {
  record: V3CriticalOperationRecord<TResult>;
  attempt: number;
  reservationToken: string;
  serverTime: number;
  receiptId: string;
  result: TResult;
}): V3CriticalOperationFinalizeResult<TResult> {
  requireServerTime(input.serverTime);
  requireSafePositiveInteger(input.attempt, "attempt");
  requireNonEmpty(input.reservationToken, "reservationToken");
  requireNonEmpty(input.receiptId, "receiptId");

  if (
    !reservationMatches(
      input.record,
      input.attempt,
      input.reservationToken,
      input.serverTime,
    )
  ) {
    return { status: "stale_reservation", record: input.record };
  }

  return {
    status: "updated",
    record: {
      ...input.record,
      status: "succeeded",
      leaseExpiresAt: null,
      updatedAt: input.serverTime,
      receiptId: input.receiptId,
      result: input.result,
      failureCode: null,
    },
  };
}

export function failV3CriticalOperation<TResult>(input: {
  record: V3CriticalOperationRecord<TResult>;
  attempt: number;
  reservationToken: string;
  serverTime: number;
  failureCode: string;
  retryable: boolean;
}): V3CriticalOperationFinalizeResult<TResult> {
  requireServerTime(input.serverTime);
  requireSafePositiveInteger(input.attempt, "attempt");
  requireNonEmpty(input.reservationToken, "reservationToken");
  requireNonEmpty(input.failureCode, "failureCode");

  if (
    !reservationMatches(
      input.record,
      input.attempt,
      input.reservationToken,
      input.serverTime,
    )
  ) {
    return { status: "stale_reservation", record: input.record };
  }

  return {
    status: "updated",
    record: {
      ...input.record,
      status: input.retryable ? "failed_retryable" : "failed_final",
      leaseExpiresAt: null,
      updatedAt: input.serverTime,
      failureCode: input.failureCode,
    },
  };
}
