import { describe, expect, it } from "vitest";

import {
  transitionV3CriticalOperation,
  V3CriticalOperationTransitionError,
  v3CriticalOperationCanRetry,
  v3CriticalOperationIsBusy,
  v3CriticalOperationNeedsReconciliation,
  v3CriticalOperationUserMessage,
  type V3CriticalOperationState,
} from "./v3-critical-operation";

const idle = (): V3CriticalOperationState => ({
  phase: "idle",
  kind: "jury",
});

function started() {
  return transitionV3CriticalOperation(idle(), {
    type: "begin",
    operationId: "op-1",
    idempotencyKey: "idem-1",
    at: "2026-10-11T19:00:00.000Z",
  });
}

describe("V3 critical operation safety", () => {
  it("starts with a stable operation id and idempotency key", () => {
    expect(started()).toEqual({
      phase: "submitting",
      kind: "jury",
      operationId: "op-1",
      idempotencyKey: "idem-1",
      startedAt: "2026-10-11T19:00:00.000Z",
    });
  });

  it("treats a transport timeout as uncertain rather than failed", () => {
    const uncertain = transitionV3CriticalOperation(started(), {
      type: "transport-uncertain",
      at: "2026-10-11T19:00:05.000Z",
      reason: "timeout",
    });

    expect(uncertain).toMatchObject({
      phase: "uncertain",
      operationId: "op-1",
      idempotencyKey: "idem-1",
      reason: "timeout",
    });
    expect(v3CriticalOperationNeedsReconciliation(uncertain)).toBe(true);
    expect(v3CriticalOperationCanRetry(uncertain)).toBe(false);
    expect(v3CriticalOperationIsBusy(uncertain)).toBe(true);
    expect(v3CriticalOperationUserMessage(uncertain)).toBe(
      "Checking whether your submission was received…",
    );
  });

  it("confirms an uncertain operation only after authoritative reconciliation", () => {
    const uncertain = transitionV3CriticalOperation(started(), {
      type: "transport-uncertain",
      at: "2026-10-11T19:00:05.000Z",
      reason: "transport",
    });

    const confirmed = transitionV3CriticalOperation(uncertain, {
      type: "confirmed",
      receiptId: "JRY-S22-SF1-4921",
      stateVersion: "jury:42",
      at: "2026-10-11T19:00:07.000Z",
    });

    expect(confirmed).toEqual({
      phase: "confirmed",
      kind: "jury",
      operationId: "op-1",
      idempotencyKey: "idem-1",
      receiptId: "JRY-S22-SF1-4921",
      confirmedAt: "2026-10-11T19:00:07.000Z",
      stateVersion: "jury:42",
    });
    expect(v3CriticalOperationUserMessage(confirmed)).toBe("Submitted");
  });

  it("prevents double submission while the first request is active", () => {
    expect(() =>
      transitionV3CriticalOperation(started(), {
        type: "begin",
        operationId: "op-2",
        idempotencyKey: "idem-2",
        at: "2026-10-11T19:00:01.000Z",
      }),
    ).toThrow(V3CriticalOperationTransitionError);
  });

  it("prevents retrying an uncertain request before reconciliation", () => {
    const uncertain = transitionV3CriticalOperation(started(), {
      type: "transport-uncertain",
      at: "2026-10-11T19:00:05.000Z",
      reason: "timeout",
    });

    expect(() =>
      transitionV3CriticalOperation(uncertain, {
        type: "begin",
        operationId: "op-2",
        idempotencyKey: "idem-2",
        at: "2026-10-11T19:00:06.000Z",
      }),
    ).toThrow(/must be reconciled before retrying/i);
  });

  it("prevents resetting away an uncertain operation", () => {
    const uncertain = transitionV3CriticalOperation(started(), {
      type: "transport-uncertain",
      at: "2026-10-11T19:00:05.000Z",
      reason: "timeout",
    });

    expect(() => transitionV3CriticalOperation(uncertain, { type: "reset" })).toThrow(
      /before reconciliation/i,
    );
  });

  it("allows retry only after an explicitly retryable terminal failure", () => {
    const failed = transitionV3CriticalOperation(started(), {
      type: "failed",
      at: "2026-10-11T19:00:03.000Z",
      failure: {
        code: "temporarily_unavailable",
        message: "Solaris couldn't complete this action.",
        retryable: true,
      },
    });

    expect(v3CriticalOperationCanRetry(failed)).toBe(true);

    const retried = transitionV3CriticalOperation(failed, {
      type: "begin",
      operationId: "op-2",
      idempotencyKey: "idem-2",
      at: "2026-10-11T19:00:10.000Z",
    });

    expect(retried).toMatchObject({
      phase: "submitting",
      operationId: "op-2",
      idempotencyKey: "idem-2",
    });
  });

  it("keeps non-retryable rejection non-retryable", () => {
    const rejected = transitionV3CriticalOperation(started(), {
      type: "rejected",
      at: "2026-10-11T19:00:03.000Z",
      failure: {
        code: "round_closed",
        message: "This round has now closed.",
        retryable: false,
      },
    });

    expect(v3CriticalOperationCanRetry(rejected)).toBe(false);
    expect(v3CriticalOperationUserMessage(rejected)).toBe("This round has now closed.");
  });

  it("makes confirmed operations terminal until an explicit new workflow reset", () => {
    const confirmed = transitionV3CriticalOperation(started(), {
      type: "confirmed",
      receiptId: "JRY-S22-SF1-4921",
      at: "2026-10-11T19:00:02.000Z",
    });

    expect(() =>
      transitionV3CriticalOperation(confirmed, {
        type: "begin",
        operationId: "op-2",
        idempotencyKey: "idem-2",
        at: "2026-10-11T19:00:10.000Z",
      }),
    ).toThrow(/cannot be submitted again/i);

    expect(transitionV3CriticalOperation(confirmed, { type: "reset" })).toEqual({
      phase: "idle",
      kind: "jury",
    });
  });

  it("does not allow local failure to overwrite an already confirmed operation", () => {
    const confirmed = transitionV3CriticalOperation(started(), {
      type: "confirmed",
      receiptId: "JRY-S22-SF1-4921",
      at: "2026-10-11T19:00:02.000Z",
    });

    expect(() =>
      transitionV3CriticalOperation(confirmed, {
        type: "failed",
        at: "2026-10-11T19:00:04.000Z",
        failure: {
          code: "late_transport_error",
          message: "Network error",
          retryable: true,
        },
      }),
    ).toThrow(/confirmed critical operation cannot be failed/i);
  });
});
