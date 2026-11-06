import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getSession: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: mocks.rpc, auth: { getSession: mocks.getSession } },
}));
const args = { p_show_id: "show-a", p_expected_revision: 2, p_segments: [{ id: "opening" }] };
const success = (request: Record<string, unknown>) => ({
  data: {
    operationId: request.p_operation_id,
    receiptId: request.p_operation_id,
    showId: request.p_show_id,
    replayed: true,
    revision: 3,
  },
  error: null,
});
beforeEach(() => {
  vi.resetModules();
  mocks.rpc.mockReset();
  mocks.getSession
    .mockReset()
    .mockResolvedValue({ data: { session: { user: { id: "actor-a" } } }, error: null });
});
describe("governed cue transport", () => {
  it("reuses operation identity after two lost responses and a later explicit retry", async () => {
    const { executeShowCueCommand } = await import("./show-cue-command");
    mocks.rpc
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce({ data: null, error: new TypeError("lost response") })
      .mockImplementation((_name, request) => success(request));
    await expect(
      executeShowCueCommand("v3_save_show_rundown", args, (value) => value),
    ).rejects.toThrow("lost response");
    await executeShowCueCommand("v3_save_show_rundown", args, (value) => value);
    expect(new Set(mocks.rpc.mock.calls.map((call) => call[1].p_operation_id)).size).toBe(1);
  });
  it("freezes reviewed inputs before asynchronous session lookup and validates with those inputs", async () => {
    const { executeShowCueCommand } = await import("./show-cue-command");
    const mutable = structuredClone(args);
    mocks.rpc.mockImplementation((_name, request) => success(request));
    const validate = vi.fn((_value, intent) => intent.p_expected_revision);
    const result = executeShowCueCommand("v3_save_show_rundown", mutable, validate);
    mutable.p_expected_revision = 99;
    mutable.p_segments[0].id = "changed";
    expect(await result).toBe(2);
    expect(mocks.rpc.mock.calls[0][1].p_segments[0].id).toBe("opening");
  });
  it("does not reuse another signed-in actor’s unresolved identity", async () => {
    const { executeShowCueCommand } = await import("./show-cue-command");
    mocks.rpc.mockRejectedValue(new TypeError("network"));
    await expect(
      executeShowCueCommand("v3_save_show_rundown", args, (value) => value),
    ).rejects.toThrow();
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: "actor-b" } } },
      error: null,
    });
    mocks.rpc.mockImplementation((_name, request) => success(request));
    await executeShowCueCommand("v3_save_show_rundown", args, (value) => value);
    expect(mocks.rpc.mock.calls[0][1].p_operation_id).not.toBe(
      mocks.rpc.mock.calls[2][1].p_operation_id,
    );
  });
  it("does not retry a server stale-version or permission rejection", async () => {
    const { executeShowCueCommand } = await import("./show-cue-command");
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "40001", message: "stale" } });
    await expect(
      executeShowCueCommand("v3_save_show_rundown", args, (value) => value),
    ).rejects.toMatchObject({ code: "40001" });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("rejects mismatched receipt evidence and preserves identity for readback", async () => {
    const { executeShowCueCommand } = await import("./show-cue-command");
    mocks.rpc
      .mockResolvedValueOnce({ data: { operationId: "wrong" }, error: null })
      .mockImplementation((_name, request) => success(request));
    await expect(
      executeShowCueCommand("v3_save_show_rundown", args, (value) => value),
    ).rejects.toThrow("receipt is inconsistent");
    await executeShowCueCommand("v3_save_show_rundown", args, (value) => value);
    expect(mocks.rpc.mock.calls[0][1].p_operation_id).toBe(
      mocks.rpc.mock.calls[1][1].p_operation_id,
    );
  });
  it("requires a signed-in actor without issuing a mutation", async () => {
    const { executeShowCueCommand } = await import("./show-cue-command");
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(
      executeShowCueCommand("v3_save_show_rundown", args, (value) => value),
    ).rejects.toThrow("Sign in");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
