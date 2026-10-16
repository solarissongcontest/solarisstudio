import { describe, expect, it } from "vitest";

import {
  validateConfirmationRoundChangePreview,
  validateConfirmationRoundChangeReceipt,
  type ConfirmationRoundChangePreview,
  type ConfirmationRoundChangeReceipt,
} from "@/integrations/confirmations/admin";

const operation = {
  roundId: "round-22",
  kind: "status" as const,
  operationId: "11111111-1111-4111-8111-111111111111",
  expectedVersion: 7,
};

function preview(
  patch: Partial<ConfirmationRoundChangePreview> = {},
): ConfirmationRoundChangePreview {
  return {
    riskClass: "R2",
    changeKind: "status",
    roundId: "round-22",
    roundName: "First wave",
    editionId: "edition-22",
    expectedVersion: 7,
    responseCount: 12,
    affectedResponses: 0,
    currentlyEditableResponses: 0,
    unresolvedRequirementCount: 0,
    currentStatus: "closed",
    targetStatus: "open",
    currentEditingEnabled: false,
    targetEditingEnabled: false,
    willMoveOpeningTimeToNow: true,
    willClearExpiredClosingTime: true,
    requirementsCreated: 0,
    alreadyApplied: false,
    blockers: [],
    ...patch,
  };
}

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

describe("Organizer Confirmation round preview trust boundary", () => {
  it("accepts exact round identity, edition and consequence evidence", () => {
    expect(validateConfirmationRoundChangePreview(preview(), {
      roundId: "round-22",
      kind: "status",
      payload: { status: "open" },
    })).toMatchObject({
      roundId: "round-22",
      editionId: "edition-22",
      changeKind: "status",
      expectedVersion: 7,
      requirementsCreated: 0,
    });
  });

  it("rejects preview identity drift before it can authorize a confirmation sheet", () => {
    expect(() => validateConfirmationRoundChangePreview(
      preview({ changeKind: "editing" }),
      { roundId: "round-22", kind: "status", payload: { status: "open" } },
    )).toThrow("different change kind");
    expect(() => validateConfirmationRoundChangePreview(
      preview({ roundId: "round-21" }),
      { roundId: "round-22", kind: "status", payload: { status: "open" } },
    )).toThrow("different round");
  });

  it("binds create and update previews to the requested edition", () => {
    const createInput = {
      roundId: null,
      kind: "create" as const,
      payload: { editionId: "edition-22", name: "Second wave" },
    };
    expect(validateConfirmationRoundChangePreview(preview({
      changeKind: "create",
      roundId: null,
      roundName: "Second wave",
      expectedVersion: 0,
      responseCount: 0,
      currentStatus: undefined,
      targetStatus: "draft",
      willMoveOpeningTimeToNow: false,
      willClearExpiredClosingTime: false,
    }), createInput).editionId).toBe("edition-22");

    expect(() => validateConfirmationRoundChangePreview(preview({
      changeKind: "create",
      roundId: null,
      editionId: "edition-21",
      expectedVersion: 0,
      responseCount: 0,
      currentStatus: undefined,
      targetStatus: "draft",
      willMoveOpeningTimeToNow: false,
      willClearExpiredClosingTime: false,
    }), createInput)).toThrow("outside the requested edition scope");
  });

  it("rejects a create preview that points at an existing round", () => {
    expect(() => validateConfirmationRoundChangePreview(preview({
      changeKind: "create",
      roundId: "existing-round",
      expectedVersion: 0,
      responseCount: 0,
      currentStatus: undefined,
      targetStatus: "draft",
    }), {
      roundId: null,
      kind: "create",
      payload: { editionId: "edition-22" },
    })).toThrow("unexpectedly returned an existing round");
  });

  it("rejects malformed consequence evidence and duplicate-obligation claims", () => {
    expect(() => validateConfirmationRoundChangePreview(
      { ...preview(), expectedVersion: -1 },
      { roundId: "round-22", kind: "status" },
    )).toThrow("invalid payload");
    expect(() => validateConfirmationRoundChangePreview(
      preview({ requirementsCreated: 1 }),
      { roundId: "round-22", kind: "status" },
    )).toThrow("unexpectedly creates confirmation requirements");
  });
});

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
