import { describe, expect, it } from "vitest";

import {
  validateHostOperationExecution,
  type HostOperationExecution,
} from "./studio2-host-management";

const execution: HostOperationExecution = {
  executionId: "operation-22",
  editionId: "edition-22",
  bidId: "bid-1",
  action: "select_bid",
  reason: "Select the approved host bid",
  bidRevision: 4,
  operationsRevision: 2,
  idempotentReplay: false,
};

const request = {
  executionId: "operation-22",
  editionId: "edition-22",
  bidId: "bid-1",
  action: "select_bid" as const,
  reason: "Select the approved host bid",
};

describe("V3 Organizer Host operation receipt validation", () => {
  it("accepts a receipt only when the complete reviewed command identity matches", () => {
    expect(validateHostOperationExecution(execution, request)).toBe(execution);
  });

  it("rejects a receipt for another execution identity", () => {
    expect(() =>
      validateHostOperationExecution(
        { ...execution, executionId: "operation-stale" },
        request,
      ),
    ).toThrow("executionId");
  });

  it("rejects a receipt for another edition", () => {
    expect(() =>
      validateHostOperationExecution(
        { ...execution, editionId: "edition-21" },
        request,
      ),
    ).toThrow("editionId");
  });

  it("rejects a receipt for another host action", () => {
    expect(() =>
      validateHostOperationExecution(
        { ...execution, action: "reject_bid" },
        request,
      ),
    ).toThrow("action");
  });

  it("rejects a receipt for another bid", () => {
    expect(() =>
      validateHostOperationExecution(
        { ...execution, bidId: "bid-2" },
        request,
      ),
    ).toThrow("bidId");
  });

  it("rejects a receipt whose audit reason does not match the reviewed command", () => {
    expect(() =>
      validateHostOperationExecution(
        { ...execution, reason: "A different semantic request" },
        request,
      ),
    ).toThrow("reason");
  });
});
