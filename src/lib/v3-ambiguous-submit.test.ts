import { describe, expect, it } from "vitest";

import {
  V3_RECONCILIATION_MAX_AUTOMATIC_CHECKS,
  applyV3TransportOutcome,
  buildV3SameIdentityRetry,
  createV3SubmissionAttempt,
  dispatchV3Submission,
  reconcileV3Submission,
  v3ReconciliationDelayMs,
  type V3SubmissionIdentity,
} from "./v3-ambiguous-submit";

const IDENTITY: V3SubmissionIdentity = {
  idempotencyKey: "jury:ssc22:sf1:oland:submission-42",
  requestHash: "sha256:ballot-v1",
  scope: {
    actorId: "oland",
    action: "jury.submit",
    contextKey: "ssc22:sf1",
  },
};

function submitting() {
  return dispatchV3Submission(
    createV3SubmissionAttempt({ identity: IDENTITY, createdAt: 1_000 }),
    2_000,
  );
}

function uncertain() {
  return applyV3TransportOutcome(submitting(), {
    kind: "ambiguous",
    observedAt: 3_000,
    cause: "timeout",
  });
}

describe("Solaris Studio V3 ambiguous submission reconciliation", () => {
  it("treats a timeout after dispatch as uncertain, not failed", () => {
    const result = uncertain();

    expect(result.state).toBe("uncertain");
    expect(result.failureCode).toBeNull();
    expect(result.receiptId).toBeNull();
    expect(result.uncertainCause).toBe("timeout");
    expect(result.identity).toEqual(IDENTITY);
  });

  it("records an acknowledged success immediately with its receipt", () => {
    const result = applyV3TransportOutcome(submitting(), {
      kind: "acknowledged_success",
      serverTime: 2_500,
      receiptId: "receipt-1",
    });

    expect(result.state).toBe("confirmed");
    expect(result.receiptId).toBe("receipt-1");
    expect(result.failureCode).toBeNull();
  });

  it("only allows a retry after an explicit retryable result and preserves the same identity", () => {
    const retryable = applyV3TransportOutcome(submitting(), {
      kind: "explicit_rejection",
      serverTime: 2_500,
      failureCode: "transient_upstream",
      retryable: true,
    });

    expect(retryable.state).toBe("retry_allowed");
    expect(buildV3SameIdentityRetry(retryable)).toEqual(IDENTITY);
    expect(() => buildV3SameIdentityRetry(uncertain())).toThrow(/retry is not allowed/);
  });

  it("turns authoritative success evidence into a confirmed receipt", () => {
    const result = reconcileV3Submission(uncertain(), {
      identity: IDENTITY,
      status: "succeeded",
      checkedAt: 5_000,
      receiptId: "receipt-authoritative",
    });

    expect(result.state).toBe("confirmed");
    expect(result.receiptId).toBe("receipt-authoritative");
    expect(result.reconciliationChecks).toBe(1);
    expect(result.nextCheckNotBefore).toBeNull();
  });

  it("keeps an in-progress operation uncertain and schedules a bounded later check", () => {
    const result = reconcileV3Submission(uncertain(), {
      identity: IDENTITY,
      status: "in_progress",
      checkedAt: 5_000,
    });

    expect(result.state).toBe("uncertain");
    expect(result.reconciliationChecks).toBe(1);
    expect(result.nextCheckNotBefore).toBe(6_000);
    expect(result.automaticChecksExhausted).toBe(false);
  });

  it("does not trust a bare not-found response as proof that submission is safe to repeat", () => {
    const result = reconcileV3Submission(uncertain(), {
      identity: IDENTITY,
      status: "not_found",
      checkedAt: 5_000,
      absenceIsAuthoritative: false,
    });

    expect(result.state).toBe("uncertain");
    expect(result.failureCode).toBeNull();
    expect(result.nextCheckNotBefore).toBe(6_000);
  });

  it("allows same-key retry only when authoritative ledger absence is explicitly proven", () => {
    const result = reconcileV3Submission(uncertain(), {
      identity: IDENTITY,
      status: "not_found",
      checkedAt: 5_000,
      absenceIsAuthoritative: true,
    });

    expect(result.state).toBe("retry_allowed");
    expect(result.failureCode).toBe("authoritative_not_found");
    expect(buildV3SameIdentityRetry(result).idempotencyKey).toBe(
      IDENTITY.idempotencyKey,
    );
  });

  it("maps authoritative retryable and final failures to distinct states", () => {
    const retryable = reconcileV3Submission(uncertain(), {
      identity: IDENTITY,
      status: "failed_retryable",
      checkedAt: 5_000,
      failureCode: "temporary_failure",
    });
    const finalFailure = reconcileV3Submission(uncertain(), {
      identity: IDENTITY,
      status: "failed_final",
      checkedAt: 5_000,
      failureCode: "ineligible",
    });

    expect(retryable.state).toBe("retry_allowed");
    expect(retryable.failureCode).toBe("temporary_failure");
    expect(finalFailure.state).toBe("rejected");
    expect(finalFailure.failureCode).toBe("ineligible");
  });

  it("blocks reconciliation evidence for another key, payload, actor, action or context", () => {
    const mismatched = reconcileV3Submission(uncertain(), {
      identity: {
        ...IDENTITY,
        requestHash: "sha256:other-ballot",
      },
      status: "succeeded",
      checkedAt: 5_000,
      receiptId: "wrong-receipt",
    });

    expect(mismatched.state).toBe("identity_conflict");
    expect(mismatched.receiptId).toBeNull();
    expect(mismatched.automaticChecksExhausted).toBe(true);
  });

  it("stops automatic reconciliation after a finite number of checks", () => {
    let attempt = uncertain();

    for (let index = 1; index <= V3_RECONCILIATION_MAX_AUTOMATIC_CHECKS; index += 1) {
      attempt = reconcileV3Submission(attempt, {
        identity: IDENTITY,
        status: "in_progress",
        checkedAt: 10_000 + index * 40_000,
      });
    }

    expect(attempt.state).toBe("uncertain");
    expect(attempt.reconciliationChecks).toBe(
      V3_RECONCILIATION_MAX_AUTOMATIC_CHECKS,
    );
    expect(attempt.automaticChecksExhausted).toBe(true);
    expect(attempt.nextCheckNotBefore).toBeNull();
  });

  it("caps exponential reconciliation delay at 30 seconds", () => {
    expect(v3ReconciliationDelayMs(1)).toBe(1_000);
    expect(v3ReconciliationDelayMs(2)).toBe(2_000);
    expect(v3ReconciliationDelayMs(3)).toBe(4_000);
    expect(v3ReconciliationDelayMs(20)).toBe(30_000);
  });

  it("requires a receipt for authoritative success", () => {
    expect(() =>
      reconcileV3Submission(uncertain(), {
        identity: IDENTITY,
        status: "succeeded",
        checkedAt: 5_000,
      }),
    ).toThrow(/receiptId/);
  });

  it("does not permit a second dispatch while outcome is still uncertain", () => {
    expect(() => dispatchV3Submission(uncertain(), 6_000)).toThrow(
      /cannot dispatch submission from state uncertain/,
    );
  });
});
