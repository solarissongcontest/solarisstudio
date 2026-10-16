import { describe, expect, it } from "vitest";

import {
  validateConfirmationRoundChangeReceipt,
  type ConfirmationRoundChangeReceipt,
} from "@/integrations/confirmations/admin";

const operation = {
  roundId: "round-22",
  kind: "status" as const,
  operationId: "11111111-1111-4111-8111-111111111111",
  expectedVersion: 7,
};

function receipt(
  patch: Partial<ConfirmationRoundChangeReceipt> = {},
): ConfirmationRoundChangeReceipt {
  return {
    ok: true,
    riskClass: "R2",
    changeKind: "status",
    roundId: "round-22",
    status: "open",
    editingEnabled: false,
    affectedResponses: 0,
    requirementsCreated: 0,
    previousVersion: 7,
    version: 8,
    operationId: operation.operationId,
    ...patch,
  };
}

describe("Organizer Confirmation round receipt trust boundary", () => {
  it("accepts receipt identity and version evidence for the command that was sent", () => {
    expect(validateConfirmationRoundChangeReceipt(receipt(), operation)).toMatchObject({
      operationId: operation.operationId,
      changeKind: "status",
      roundId: "round-22",
      previousVersion: 7,
      version: 8,
      requirementsCreated: 0,
    });
  });

  it("rejects a receipt belonging to another semantic operation", () => {
    expect(() => validateConfirmationRoundChangeReceipt(
      receipt({ operationId: "22222222-2222-4222-8222-222222222222" }),
      operation,
    )).toThrow("receipt for a different operation");
    expect(() => validateConfirmationRoundChangeReceipt(
      receipt({ changeKind: "editing" }),
      operation,
    )).toThrow("receipt for a different change kind");
    expect(() => validateConfirmationRoundChangeReceipt(
      receipt({ roundId: "round-21" }),
      operation,
    )).toThrow("receipt for a different round");
  });

  it("rejects stale or regressive version evidence", () => {
    expect(() => validateConfirmationRoundChangeReceipt(
      receipt({ previousVersion: 6 }),
      operation,
    )).toThrow("inconsistent version evidence");
    expect(() => validateConfirmationRoundChangeReceipt(
      receipt({ version: 6 }),
      operation,
    )).toThrow("inconsistent version evidence");
  });

  it("enforces the invariant that round operations never create confirmation requirements", () => {
    expect(() => validateConfirmationRoundChangeReceipt(
      receipt({ requirementsCreated: 1 }),
      operation,
    )).toThrow("unexpectedly created confirmation requirements");
  });

  it("allows a create receipt to return the new server-assigned round id", () => {
    const createOperation = {
      roundId: null,
      kind: "create" as const,
      operationId: operation.operationId,
      expectedVersion: 0,
    };
    expect(validateConfirmationRoundChangeReceipt(
      receipt({
        changeKind: "create",
        roundId: "new-round",
        status: "draft",
        previousVersion: 0,
        version: 0,
      }),
      createOperation,
    ).roundId).toBe("new-round");
  });

  it("rejects malformed success-shaped data instead of casting it into authority", () => {
    expect(() => validateConfirmationRoundChangeReceipt(null, operation)).toThrow(
      "invalid receipt",
    );
    expect(() => validateConfirmationRoundChangeReceipt(
      { ...receipt(), affectedResponses: -1 },
      operation,
    )).toThrow("invalid receipt");
  });
});
