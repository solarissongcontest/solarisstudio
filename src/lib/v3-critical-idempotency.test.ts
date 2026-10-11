import { describe, expect, it } from "vitest";

import {
  beginV3CriticalOperation,
  failV3CriticalOperation,
  succeedV3CriticalOperation,
  type V3CriticalOperationRequest,
} from "./v3-critical-idempotency";

const REQUEST: V3CriticalOperationRequest = {
  idempotencyKey: "jury:ssc22:sf1:oland:submission-42",
  requestHash: "sha256:ballot-v1",
  scope: {
    actorId: "oland",
    action: "jury.submit",
    contextKey: "ssc22:sf1",
  },
};

const START = 1_000_000;
const LEASE = 30_000;

function beginNew<TResult = { submissionId: string }>() {
  return beginV3CriticalOperation<TResult>({
    existing: null,
    request: REQUEST,
    reservationToken: "worker-a",
    serverTime: START,
    leaseDurationMs: LEASE,
  });
}

describe("Solaris Studio V3 critical operation idempotency", () => {
  it("reserves a new operation for exactly one execution attempt", () => {
    const decision = beginNew();
    expect(decision.decision).toBe("execute");
    if (decision.decision !== "execute") return;

    expect(decision.reason).toBe("new_operation");
    expect(decision.record.status).toBe("in_progress");
    expect(decision.record.attempt).toBe(1);
    expect(decision.record.reservationToken).toBe("worker-a");
    expect(decision.record.leaseExpiresAt).toBe(START + LEASE);
  });

  it("replays a successful result instead of executing the mutation twice", () => {
    const first = beginNew();
    if (first.decision !== "execute") throw new Error("expected execute");

    const success = succeedV3CriticalOperation({
      record: first.record,
      attempt: first.record.attempt,
      reservationToken: "worker-a",
      serverTime: START + 2_000,
      receiptId: "receipt-1",
      result: { submissionId: "submission-1" },
    });
    if (success.status !== "updated") throw new Error("expected update");

    const replay = beginV3CriticalOperation({
      existing: success.record,
      request: REQUEST,
      reservationToken: "worker-b",
      serverTime: START + 5_000,
      leaseDurationMs: LEASE,
    });

    expect(replay.decision).toBe("replay_success");
    if (replay.decision !== "replay_success") return;
    expect(replay.record.receiptId).toBe("receipt-1");
    expect(replay.record.result).toEqual({ submissionId: "submission-1" });
    expect(replay.record.attempt).toBe(1);
  });

  it("rejects an existing ledger row returned for a different idempotency key", () => {
    const first = beginNew();
    if (first.decision !== "execute") throw new Error("expected execute");

    const conflict = beginV3CriticalOperation({
      existing: first.record,
      request: { ...REQUEST, idempotencyKey: "jury:other-key" },
      reservationToken: "worker-b",
      serverTime: START + 1_000,
      leaseDurationMs: LEASE,
    });

    expect(conflict.decision).toBe("conflict");
    if (conflict.decision !== "conflict") return;
    expect(conflict.reason).toBe("key_mismatch");
  });

  it("rejects reuse of an idempotency key for a different payload", () => {
    const first = beginNew();
    if (first.decision !== "execute") throw new Error("expected execute");

    const conflict = beginV3CriticalOperation({
      existing: first.record,
      request: { ...REQUEST, requestHash: "sha256:different-ballot" },
      reservationToken: "worker-b",
      serverTime: START + 1_000,
      leaseDurationMs: LEASE,
    });

    expect(conflict.decision).toBe("conflict");
    if (conflict.decision !== "conflict") return;
    expect(conflict.reason).toBe("payload_mismatch");
  });

  it("rejects reuse of an idempotency key in another actor/action/context scope", () => {
    const first = beginNew();
    if (first.decision !== "execute") throw new Error("expected execute");

    const conflict = beginV3CriticalOperation({
      existing: first.record,
      request: {
        ...REQUEST,
        scope: { ...REQUEST.scope, actorId: "vendia" },
      },
      reservationToken: "worker-b",
      serverTime: START + 1_000,
      leaseDurationMs: LEASE,
    });

    expect(conflict.decision).toBe("conflict");
    if (conflict.decision !== "conflict") return;
    expect(conflict.reason).toBe("scope_mismatch");
  });

  it("does not start a second execution while the first server lease is active", () => {
    const first = beginNew();
    if (first.decision !== "execute") throw new Error("expected execute");

    const duplicate = beginV3CriticalOperation({
      existing: first.record,
      request: REQUEST,
      reservationToken: "worker-b",
      serverTime: START + 10_000,
      leaseDurationMs: LEASE,
    });

    expect(duplicate.decision).toBe("in_progress");
    if (duplicate.decision !== "in_progress") return;
    expect(duplicate.record.reservationToken).toBe("worker-a");
    expect(duplicate.record.attempt).toBe(1);
  });

  it("permits takeover only after the server lease expires", () => {
    const first = beginNew();
    if (first.decision !== "execute") throw new Error("expected execute");

    const takeover = beginV3CriticalOperation({
      existing: first.record,
      request: REQUEST,
      reservationToken: "worker-b",
      serverTime: START + LEASE,
      leaseDurationMs: LEASE,
    });

    expect(takeover.decision).toBe("execute");
    if (takeover.decision !== "execute") return;
    expect(takeover.reason).toBe("expired_lease");
    expect(takeover.record.attempt).toBe(2);
    expect(takeover.record.reservationToken).toBe("worker-b");
  });

  it("rejects finalization once a reservation lease has expired even before takeover", () => {
    const first = beginNew();
    if (first.decision !== "execute") throw new Error("expected execute");

    const lateSuccess = succeedV3CriticalOperation({
      record: first.record,
      attempt: 1,
      reservationToken: "worker-a",
      serverTime: START + LEASE,
      receiptId: "late-receipt",
      result: { submissionId: "late" },
    });

    expect(lateSuccess.status).toBe("stale_reservation");
    expect(lateSuccess.record.status).toBe("in_progress");
  });

  it("prevents an expired worker from finalizing after another worker takes over", () => {
    const first = beginNew();
    if (first.decision !== "execute") throw new Error("expected execute");

    const takeover = beginV3CriticalOperation({
      existing: first.record,
      request: REQUEST,
      reservationToken: "worker-b",
      serverTime: START + LEASE,
      leaseDurationMs: LEASE,
    });
    if (takeover.decision !== "execute") throw new Error("expected takeover");

    const staleFinalize = succeedV3CriticalOperation({
      record: takeover.record,
      attempt: 1,
      reservationToken: "worker-a",
      serverTime: START + LEASE + 1_000,
      receiptId: "stale-receipt",
      result: { submissionId: "wrong" },
    });

    expect(staleFinalize.status).toBe("stale_reservation");
    expect(staleFinalize.record.status).toBe("in_progress");
    expect(staleFinalize.record.reservationToken).toBe("worker-b");
  });

  it("allows a retryable failure to reserve a new attempt", () => {
    const first = beginNew();
    if (first.decision !== "execute") throw new Error("expected execute");

    const failure = failV3CriticalOperation({
      record: first.record,
      attempt: 1,
      reservationToken: "worker-a",
      serverTime: START + 1_000,
      failureCode: "transient_upstream",
      retryable: true,
    });
    if (failure.status !== "updated") throw new Error("expected failure update");

    const retry = beginV3CriticalOperation({
      existing: failure.record,
      request: REQUEST,
      reservationToken: "worker-b",
      serverTime: START + 2_000,
      leaseDurationMs: LEASE,
    });

    expect(retry.decision).toBe("execute");
    if (retry.decision !== "execute") return;
    expect(retry.reason).toBe("retryable_failure");
    expect(retry.record.attempt).toBe(2);
    expect(retry.record.failureCode).toBeNull();
  });

  it("does not retry a final failure", () => {
    const first = beginNew();
    if (first.decision !== "execute") throw new Error("expected execute");

    const failure = failV3CriticalOperation({
      record: first.record,
      attempt: 1,
      reservationToken: "worker-a",
      serverTime: START + 1_000,
      failureCode: "ineligible",
      retryable: false,
    });
    if (failure.status !== "updated") throw new Error("expected failure update");

    const retry = beginV3CriticalOperation({
      existing: failure.record,
      request: REQUEST,
      reservationToken: "worker-b",
      serverTime: START + 2_000,
      leaseDurationMs: LEASE,
    });

    expect(retry.decision).toBe("final_failure");
    expect(retry.record.attempt).toBe(1);
  });

  it("never trusts client time to decide whether an operation lease expired", () => {
    const first = beginNew();
    if (first.decision !== "execute") throw new Error("expected execute");

    const stillRunning = beginV3CriticalOperation({
      existing: first.record,
      request: REQUEST,
      reservationToken: "worker-b",
      serverTime: START + LEASE - 1,
      leaseDurationMs: LEASE,
    });

    expect(stillRunning.decision).toBe("in_progress");
  });
});
