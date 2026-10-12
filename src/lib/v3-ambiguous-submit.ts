export type V3SubmissionState =
  | "ready"
  | "submitting"
  | "uncertain"
  | "confirmed"
  | "retry_allowed"
  | "rejected"
  | "identity_conflict";

export type V3SubmissionScope = {
  actorId: string;
  action: string;
  contextKey: string;
};

export type V3SubmissionIdentity = {
  idempotencyKey: string;
  requestHash: string;
  scope: V3SubmissionScope;
};

export type V3AmbiguousCause =
  | "timeout"
  | "network_error"
  | "connection_lost"
  | "client_abort_after_dispatch"
  | "unknown";

export type V3SubmissionAttempt = {
  identity: V3SubmissionIdentity;
  state: V3SubmissionState;
  createdAt: number;
  dispatchedAt: number | null;
  updatedAt: number;
  receiptId: string | null;
  failureCode: string | null;
  uncertainCause: V3AmbiguousCause | null;
  reconciliationChecks: number;
  nextCheckNotBefore: number | null;
  automaticChecksExhausted: boolean;
};

export type V3TransportOutcome =
  | {
      kind: "acknowledged_success";
      serverTime: number;
      receiptId: string;
    }
  | {
      kind: "explicit_rejection";
      serverTime: number;
      failureCode: string;
      retryable: boolean;
    }
  | {
      kind: "ambiguous";
      observedAt: number;
      cause: V3AmbiguousCause;
    };

export type V3AuthoritativeSubmissionEvidence = {
  identity: V3SubmissionIdentity;
  status:
    | "succeeded"
    | "in_progress"
    | "failed_retryable"
    | "failed_final"
    | "not_found";
  checkedAt: number;
  receiptId?: string | null;
  failureCode?: string | null;
  /**
   * `not_found` is safe to use for retry decisions only when the server can
   * prove that the same authoritative idempotency ledger was checked and that
   * reservation happens before the protected side effect.
   */
  absenceIsAuthoritative?: boolean;
};

export const V3_RECONCILIATION_MAX_AUTOMATIC_CHECKS = 8;
const V3_RECONCILIATION_BASE_DELAY_MS = 1_000;
const V3_RECONCILIATION_MAX_DELAY_MS = 30_000;

function requireNonEmpty(value: string, label: string) {
  if (!value.trim()) throw new Error(`${label} must not be empty`);
}

function requireTime(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number`);
  }
}

function validateIdentity(identity: V3SubmissionIdentity) {
  requireNonEmpty(identity.idempotencyKey, "idempotencyKey");
  requireNonEmpty(identity.requestHash, "requestHash");
  requireNonEmpty(identity.scope.actorId, "scope.actorId");
  requireNonEmpty(identity.scope.action, "scope.action");
  requireNonEmpty(identity.scope.contextKey, "scope.contextKey");
}

function sameScope(left: V3SubmissionScope, right: V3SubmissionScope) {
  return (
    left.actorId === right.actorId &&
    left.action === right.action &&
    left.contextKey === right.contextKey
  );
}

export function sameV3SubmissionIdentity(
  left: V3SubmissionIdentity,
  right: V3SubmissionIdentity,
) {
  return (
    left.idempotencyKey === right.idempotencyKey &&
    left.requestHash === right.requestHash &&
    sameScope(left.scope, right.scope)
  );
}

export function createV3SubmissionAttempt(input: {
  identity: V3SubmissionIdentity;
  createdAt: number;
}): V3SubmissionAttempt {
  validateIdentity(input.identity);
  requireTime(input.createdAt, "createdAt");

  return {
    identity: input.identity,
    state: "ready",
    createdAt: input.createdAt,
    dispatchedAt: null,
    updatedAt: input.createdAt,
    receiptId: null,
    failureCode: null,
    uncertainCause: null,
    reconciliationChecks: 0,
    nextCheckNotBefore: null,
    automaticChecksExhausted: false,
  };
}

export function dispatchV3Submission(
  attempt: V3SubmissionAttempt,
  dispatchedAt: number,
): V3SubmissionAttempt {
  requireTime(dispatchedAt, "dispatchedAt");
  if (attempt.state !== "ready" && attempt.state !== "retry_allowed") {
    throw new Error(`cannot dispatch submission from state ${attempt.state}`);
  }

  return {
    ...attempt,
    state: "submitting",
    dispatchedAt,
    updatedAt: dispatchedAt,
    receiptId: null,
    failureCode: null,
    uncertainCause: null,
    reconciliationChecks: 0,
    nextCheckNotBefore: null,
    automaticChecksExhausted: false,
  };
}

/**
 * Transport ambiguity is not an application failure.
 *
 * Once a request may have reached the server, timeout/disconnect/abort must
 * preserve the same idempotency identity and enter reconciliation. The caller
 * must not invent a fresh key or claim that the protected mutation failed.
 */
export function applyV3TransportOutcome(
  attempt: V3SubmissionAttempt,
  outcome: V3TransportOutcome,
): V3SubmissionAttempt {
  if (attempt.state !== "submitting") {
    throw new Error(`cannot apply transport outcome from state ${attempt.state}`);
  }

  if (outcome.kind === "acknowledged_success") {
    requireTime(outcome.serverTime, "serverTime");
    requireNonEmpty(outcome.receiptId, "receiptId");
    return {
      ...attempt,
      state: "confirmed",
      updatedAt: outcome.serverTime,
      receiptId: outcome.receiptId,
      failureCode: null,
      uncertainCause: null,
      nextCheckNotBefore: null,
      automaticChecksExhausted: false,
    };
  }

  if (outcome.kind === "explicit_rejection") {
    requireTime(outcome.serverTime, "serverTime");
    requireNonEmpty(outcome.failureCode, "failureCode");
    return {
      ...attempt,
      state: outcome.retryable ? "retry_allowed" : "rejected",
      updatedAt: outcome.serverTime,
      receiptId: null,
      failureCode: outcome.failureCode,
      uncertainCause: null,
      nextCheckNotBefore: null,
      automaticChecksExhausted: false,
    };
  }

  requireTime(outcome.observedAt, "observedAt");
  return {
    ...attempt,
    state: "uncertain",
    updatedAt: outcome.observedAt,
    receiptId: null,
    failureCode: null,
    uncertainCause: outcome.cause,
    nextCheckNotBefore: outcome.observedAt,
    automaticChecksExhausted: false,
  };
}

export function v3ReconciliationDelayMs(checkNumber: number) {
  if (!Number.isSafeInteger(checkNumber) || checkNumber < 1) {
    throw new Error("checkNumber must be a positive safe integer");
  }

  const exponential =
    V3_RECONCILIATION_BASE_DELAY_MS * 2 ** Math.min(checkNumber - 1, 10);
  return Math.min(exponential, V3_RECONCILIATION_MAX_DELAY_MS);
}

function identityConflict(
  attempt: V3SubmissionAttempt,
  checkedAt: number,
): V3SubmissionAttempt {
  return {
    ...attempt,
    state: "identity_conflict",
    updatedAt: checkedAt,
    nextCheckNotBefore: null,
    automaticChecksExhausted: true,
  };
}

/**
 * Reconcile one uncertain submission against authoritative server evidence.
 *
 * This function performs no polling itself. Callers may schedule bounded checks
 * using `nextCheckNotBefore`; after the cap is reached, automatic checking must
 * stop. That prevents an ambiguous mutation from turning into an uncontrolled
 * request loop or Supabase egress leak.
 */
export function reconcileV3Submission(
  attempt: V3SubmissionAttempt,
  evidence: V3AuthoritativeSubmissionEvidence,
): V3SubmissionAttempt {
  requireTime(evidence.checkedAt, "checkedAt");
  validateIdentity(evidence.identity);

  if (
    attempt.state !== "uncertain" &&
    attempt.state !== "submitting"
  ) {
    throw new Error(`cannot reconcile submission from state ${attempt.state}`);
  }

  if (!sameV3SubmissionIdentity(attempt.identity, evidence.identity)) {
    return identityConflict(attempt, evidence.checkedAt);
  }

  const nextCheckCount = attempt.reconciliationChecks + 1;

  if (evidence.status === "succeeded") {
    if (!evidence.receiptId) {
      throw new Error("succeeded evidence must include receiptId");
    }
    requireNonEmpty(evidence.receiptId, "receiptId");
    return {
      ...attempt,
      state: "confirmed",
      updatedAt: evidence.checkedAt,
      receiptId: evidence.receiptId,
      failureCode: null,
      uncertainCause: null,
      reconciliationChecks: nextCheckCount,
      nextCheckNotBefore: null,
      automaticChecksExhausted: false,
    };
  }

  if (evidence.status === "failed_retryable") {
    if (!evidence.failureCode) {
      throw new Error("failed_retryable evidence must include failureCode");
    }
    return {
      ...attempt,
      state: "retry_allowed",
      updatedAt: evidence.checkedAt,
      receiptId: null,
      failureCode: evidence.failureCode,
      reconciliationChecks: nextCheckCount,
      nextCheckNotBefore: null,
      automaticChecksExhausted: false,
    };
  }

  if (evidence.status === "failed_final") {
    if (!evidence.failureCode) {
      throw new Error("failed_final evidence must include failureCode");
    }
    return {
      ...attempt,
      state: "rejected",
      updatedAt: evidence.checkedAt,
      receiptId: null,
      failureCode: evidence.failureCode,
      reconciliationChecks: nextCheckCount,
      nextCheckNotBefore: null,
      automaticChecksExhausted: false,
    };
  }

  if (evidence.status === "not_found" && evidence.absenceIsAuthoritative === true) {
    return {
      ...attempt,
      state: "retry_allowed",
      updatedAt: evidence.checkedAt,
      receiptId: null,
      failureCode: "authoritative_not_found",
      reconciliationChecks: nextCheckCount,
      nextCheckNotBefore: null,
      automaticChecksExhausted: false,
    };
  }

  const exhausted =
    nextCheckCount >= V3_RECONCILIATION_MAX_AUTOMATIC_CHECKS;
  return {
    ...attempt,
    state: "uncertain",
    updatedAt: evidence.checkedAt,
    reconciliationChecks: nextCheckCount,
    nextCheckNotBefore: exhausted
      ? null
      : evidence.checkedAt + v3ReconciliationDelayMs(nextCheckCount),
    automaticChecksExhausted: exhausted,
  };
}

/**
 * A retry after an explicit/authoritative retryable result MUST reuse the same
 * operation identity. The caller may resend the request, but it may not mint a
 * new idempotency key to escape reconciliation.
 */
export function buildV3SameIdentityRetry(
  attempt: V3SubmissionAttempt,
): V3SubmissionIdentity {
  if (attempt.state !== "retry_allowed") {
    throw new Error(`retry is not allowed from state ${attempt.state}`);
  }
  return attempt.identity;
}
