import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: mocks.rpc },
}));
import { recoverWorldOfficialOperationEnvelope } from "./world-official-operation-receipt";

const operationId = "11111111-1111-4111-8111-111111111111";
const successful = {
  operationId,
  command: "world.statement.publish",
  status: "succeeded",
  result: { ok: true, operationId, statementId: "st-1", versionId: "v-1" },
};

describe("TG9 actor-owned lost-response receipt recovery", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not add a network request when original publication was confirmed", async () => {
    await expect(recoverWorldOfficialOperationEnvelope({
      data: { ...successful, replayed: false }, error: null,
    }, operationId, "world.statement.publish")).resolves.toEqual({
      ...successful, replayed: false,
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("reconciles a timed-out publication using the exact actor-owned operation ID", async () => {
    mocks.rpc.mockResolvedValue({ data: successful, error: null });
    await expect(recoverWorldOfficialOperationEnvelope({
      data: null, error: { message: "network timeout" },
    }, operationId, "world.statement.publish")).resolves.toMatchObject({
      status: "succeeded", replayed: true,
      result: { statementId: "st-1" },
    });
    expect(mocks.rpc).toHaveBeenCalledWith("studio2_reconcile_operation", {
      p_operation_id: operationId,
    });
  });

  it("will never recover an unrelated operation or a non-succeeded receipt", async () => {
    for (const modified of [
      { ...successful, command: "world.decision.publish" },
      { ...successful, operationId: "other-operation" },
      { ...successful, status: "uncertain" },
      { ...successful, result: { ...successful.result, operationId: "other-operation" } },
    ]) {
      mocks.rpc.mockResolvedValueOnce({ data: modified, error: null });
      await expect(recoverWorldOfficialOperationEnvelope({
        data: null, error: { message: "Original publication failed" },
      }, operationId, "world.statement.publish")).rejects.toThrow("Original publication failed");
    }
    expect(mocks.rpc).toHaveBeenCalledTimes(4);
  });

  it("does not declare success if the recovery endpoint is denied/unavailable", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "Unauthorized" } });
    await expect(recoverWorldOfficialOperationEnvelope({
      data: null, error: { message: "network failure" },
    }, operationId, "world.statement.publish")).rejects.toThrow("network failure");
  });
});
