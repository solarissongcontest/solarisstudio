import { describe, expect, it, vi } from "vitest";

import {
  executeJuryVoteChange,
  type JuryVoteCommandRequest,
} from "./v3-jury-vote-command";

const request: JuryVoteCommandRequest = {
  editionId: "11111111-1111-4111-8111-111111111111",
  showId: "22222222-2222-4222-8222-222222222222",
  voterId: null,
  voterCountryId: "33333333-3333-4333-8333-333333333333",
  voterEntityId: null,
  receivingCountryId: "44444444-4444-4444-8444-444444444444",
  receivingEntityId: null,
  points: 12,
  action: "assign",
  expectedVersion: 7,
  operationId: "55555555-5555-4555-8555-555555555555",
  idempotencyKey: "jury-vote-assign-test",
};

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    status: "succeeded",
    replayed: false,
    result: {
      operationId: request.operationId,
      action: request.action,
      showId: request.showId,
      points: request.points,
      previousVersion: request.expectedVersion,
      version: request.expectedVersion + 1,
      voteId: "66666666-6666-4666-8666-666666666666",
      deletedRows: 0,
      ...overrides,
    },
  };
}

describe("executeJuryVoteChange", () => {
  it("uses the canonical operation envelope", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: receipt(), error: null });

    const result = await executeJuryVoteChange(request, { rpc });

    expect(result.version).toBe(8);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("studio2_apply_jury_vote_change", {
      p_edition_id: request.editionId,
      p_show_id: request.showId,
      p_voter_id: request.voterId,
      p_voter_country_id: request.voterCountryId,
      p_voter_entity_id: request.voterEntityId,
      p_receiving_country_id: request.receivingCountryId,
      p_receiving_entity_id: request.receivingEntityId,
      p_points: request.points,
      p_action: request.action,
      p_operation_id: request.operationId,
      p_idempotency_key: request.idempotencyKey,
      p_expected_version: request.expectedVersion,
    });
  });

  it("reconciles a response lost after commit instead of blindly retrying", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: null, error: new Error("network lost") })
      .mockResolvedValueOnce({ data: receipt(), error: null });

    const result = await executeJuryVoteChange(request, { rpc });

    expect(result.operationId).toBe(request.operationId);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenNthCalledWith(2, "studio2_reconcile_operation", {
      p_operation_id: request.operationId,
    });
  });

  it("rejects a receipt for a different semantic request", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: receipt({ points: 10 }),
      error: null,
    });

    await expect(executeJuryVoteChange(request, { rpc })).rejects.toThrow(
      "disagrees with the requested mutation",
    );
  });

  it("surfaces the original error when reconciliation cannot prove success", async () => {
    const original = new Error("database request failed");
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: null, error: original })
      .mockResolvedValueOnce({ data: null, error: new Error("receipt unavailable") });

    await expect(executeJuryVoteChange(request, { rpc })).rejects.toBe(original);
  });
});
