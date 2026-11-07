import { describe, expect, it } from "vitest";

import {
  buildOrganizerOperationFailure,
  buildOrganizerOperationSuccess,
  classifyOrganizerOperationError,
  organizerOperationAllowedActions,
  organizerOperationContextLabel,
  organizerOperationDefaultCopy,
  selectOrganizerOperationDiagnostics,
} from "./v3-organizer-operation-feedback";

describe("Organizer operation feedback", () => {
  it("maps stable error classes to the canonical UX taxonomy", () => {
    expect(classifyOrganizerOperationError("PERMISSION_DENIED")).toBe("permission");
    expect(classifyOrganizerOperationError("validation_failed")).toBe("validation");
    expect(classifyOrganizerOperationError("STATE_CHANGED")).toBe("state_changed");
    expect(classifyOrganizerOperationError("VERSION_CONFLICT")).toBe("conflict");
    expect(classifyOrganizerOperationError("NETWORK_UNREACHABLE")).toBe("connection");
    expect(classifyOrganizerOperationError("CONNECTION_LOST")).toBe("uncertain");
    expect(classifyOrganizerOperationError("TIMEOUT")).toBe("uncertain");
    expect(classifyOrganizerOperationError("FETCH_FAILED")).toBe("uncertain");
    expect(classifyOrganizerOperationError("RESPONSE_LOST")).toBe("uncertain");
    expect(classifyOrganizerOperationError("UNMAPPED_SERVER_CODE")).toBe("server_failure");
  });

  it("never offers blind retry while the operation outcome is uncertain", () => {
    expect(
      organizerOperationAllowedActions({
        phase: "reconciling",
        errorClass: "uncertain",
      }),
    ).toEqual(["reconcile"]);

    expect(
      organizerOperationAllowedActions({
        phase: "failed",
        errorClass: "server_failure",
      }),
    ).toEqual(["retry"]);
  });

  it("treats timeout/connection loss as uncertain unless transport proves the request was never sent", () => {
    for (const code of ["TIMEOUT", "CONNECTION_LOST", "FETCH_FAILED", "NETWORK_ERROR"] as const) {
      const feedback = buildOrganizerOperationFailure({
        code,
        diagnostics: { operationId: `op-${code.toLowerCase()}` },
      });
      expect(feedback.phase).toBe("reconciling");
      expect(feedback.errorClass).toBe("uncertain");
      expect(organizerOperationAllowedActions(feedback)).toEqual(["reconcile"]);
    }

    const notSent = buildOrganizerOperationFailure({ code: "REQUEST_NOT_SENT" });
    expect(notSent.phase).toBe("failed");
    expect(notSent.errorClass).toBe("connection");
    expect(organizerOperationAllowedActions(notSent)).toEqual(["retry"]);
  });

  it("makes stale-version conflicts compare/reload instead of overwrite", () => {
    expect(
      organizerOperationAllowedActions({
        phase: "conflict",
        errorClass: "conflict",
        reviewedVersion: 4,
        currentVersion: 5,
      }),
    ).toEqual(["compare", "reload"]);

    expect(
      organizerOperationAllowedActions({
        phase: "conflict",
        errorClass: "conflict",
      }),
    ).toEqual(["reload"]);
  });

  it("reloads permission/state changes and does not retry client validation failures", () => {
    expect(organizerOperationAllowedActions({ phase: "failed", errorClass: "permission" })).toEqual(["reload"]);
    expect(organizerOperationAllowedActions({ phase: "failed", errorClass: "state_changed" })).toEqual(["reload"]);
    expect(organizerOperationAllowedActions({ phase: "failed", errorClass: "validation" })).toEqual([]);
  });

  it("only selects explicitly safe diagnostics", () => {
    const diagnostics = selectOrganizerOperationDiagnostics({
      errorCode: "STATE_CHANGED",
      operationId: "op-123",
      correlationId: "corr-456",
      receiptId: "receipt-789",
      stateVersion: 9,
      serverTime: "2026-10-23T18:00:00Z",
      stack: "SECRET STACK",
      accessToken: "SECRET TOKEN",
      payload: { private: true },
      metadata: { raw: true },
    });

    expect(diagnostics).toEqual({
      errorCode: "STATE_CHANGED",
      operationId: "op-123",
      correlationId: "corr-456",
      receiptId: "receipt-789",
      stateVersion: 9,
      serverTime: "2026-10-23T18:00:00Z",
    });
    expect(diagnostics).not.toHaveProperty("stack");
    expect(diagnostics).not.toHaveProperty("accessToken");
    expect(diagnostics).not.toHaveProperty("payload");
    expect(diagnostics).not.toHaveProperty("metadata");
  });

  it("builds uncertainty around the existing operation identity", () => {
    const feedback = buildOrganizerOperationFailure({
      code: "RESPONSE_LOST",
      diagnostics: {
        operationId: "op-existing",
        correlationId: "corr-existing",
      },
      context: {
        editionLabel: "SSC 22",
        showLabel: "Grand Final",
        subjectLabel: "Close jury voting",
      },
    });

    expect(feedback.phase).toBe("reconciling");
    expect(feedback.errorClass).toBe("uncertain");
    expect(feedback.diagnostics?.operationId).toBe("op-existing");
    expect(organizerOperationAllowedActions(feedback)).toEqual(["reconcile"]);
    expect(organizerOperationContextLabel(feedback.context)).toBe("SSC 22 · Grand Final · Close jury voting");
  });

  it("builds receipted success and preserves partial failures explicitly", () => {
    const feedback = buildOrganizerOperationSuccess({
      receipt: {
        receiptId: "receipt-1",
        operationId: "op-1",
        summary: "Reminders sent",
        outcome: "partial",
        affectedCount: 4,
        beforeVersion: 10,
        afterVersion: 11,
      },
      partialFailures: [{ label: "Vendia", reason: "No deliverable push endpoint" }],
      diagnostics: { correlationId: "corr-1" },
    });

    expect(feedback.phase).toBe("partial");
    expect(feedback.receipt?.receiptId).toBe("receipt-1");
    expect(feedback.diagnostics).toMatchObject({
      operationId: "op-1",
      receiptId: "receipt-1",
      correlationId: "corr-1",
    });
    expect(feedback.partialFailures).toHaveLength(1);
  });

  it("keeps canonical user-facing failure copy stable", () => {
    expect(organizerOperationDefaultCopy("connection").title).toBe("Couldn't reach Solaris");
    expect(organizerOperationDefaultCopy("validation").title).toBe("One item needs your attention");
    expect(organizerOperationDefaultCopy("permission").title).toBe("You don't have access to this action");
    expect(organizerOperationDefaultCopy("uncertain").title).toBe("Checking operation status…");
  });
});
