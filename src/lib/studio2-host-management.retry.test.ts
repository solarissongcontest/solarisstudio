import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

describe("Studio2 Host Management uncertain-outcome reconciliation", () => {
  it("reuses the original execution id after response loss so Create Bid cannot execute twice", async () => {
    // Dynamic imports keep this compatible with both Vitest's hoisted mock
    // semantics and the Bun-compatible runner used by Quality CI.
    const { supabase } = await import("@/integrations/supabase/client");
    const { executeStudio2HostOperation } = await import("./studio2-host-management");
    const rpcMock = vi.mocked(supabase.rpc);
    const committedExecutionIds = new Set<string>();
    let requestCount = 0;

    rpcMock.mockImplementation(async (name: string, args?: Record<string, unknown>) => {
      expect(name).toBe("studio2_execute_host_operation");
      requestCount += 1;

      const rpcArgs = args ?? {};
      const executionId = String(rpcArgs.p_execution_id ?? "");
      expect(executionId).not.toBe("");
      const alreadyCommitted = committedExecutionIds.has(executionId);
      committedExecutionIds.add(executionId);

      // Simulate the dangerous case: the server committed Create Bid, but the
      // browser lost the response. A retry is safe only if it presents exactly
      // the same execution identity to the server.
      if (requestCount === 1) {
        throw new Error("response lost after server commit");
      }

      return {
        data: {
          executionId,
          editionId: String(rpcArgs.p_edition_id),
          bidId: "bid-1",
          action: String(rpcArgs.p_action),
          reason: String(rpcArgs.p_reason),
          bidRevision: 1,
          operationsRevision: null,
          idempotentReplay: alreadyCommitted,
        },
        error: null,
      } as never;
    });

    const executionIdForCall = (index: number) => {
      const args = rpcMock.mock.calls[index]?.[1];
      return args && "p_execution_id" in args ? args.p_execution_id : undefined;
    };

    const logicalCreateBid = {
      editionId: "edition-1",
      action: "create_bid" as const,
      reason: "Create Helsinki host bid",
      payload: {
        countryId: "country-1",
        city: "Helsinki",
        venueName: "Solaris Arena",
      },
    };

    await expect(
      executeStudio2HostOperation({
        ...logicalCreateBid,
        executionId: "execution-first",
      }),
    ).rejects.toThrow("response lost after server commit");

    const reconciled = await executeStudio2HostOperation({
      ...logicalCreateBid,
      // React Query / the caller may generate a new proposed id for the retry.
      // The Host service must ignore it while the original outcome is unknown.
      executionId: "execution-should-not-replace-first",
    });

    expect(rpcMock).toHaveBeenCalledTimes(2);
    expect(executionIdForCall(0)).toBe("execution-first");
    expect(executionIdForCall(1)).toBe("execution-first");
    expect(committedExecutionIds).toEqual(new Set(["execution-first"]));
    expect(reconciled.executionId).toBe("execution-first");
    expect(reconciled.idempotentReplay).toBe(true);

    // A confirmed result closes the uncertain operation. A later deliberate
    // command with the same semantic fields is allowed to receive a fresh id.
    const deliberateLaterCommand = await executeStudio2HostOperation({
      ...logicalCreateBid,
      executionId: "execution-later",
    });

    expect(rpcMock).toHaveBeenCalledTimes(3);
    expect(executionIdForCall(2)).toBe("execution-later");
    expect(committedExecutionIds).toEqual(
      new Set(["execution-first", "execution-later"]),
    );
    expect(deliberateLaterCommand.executionId).toBe("execution-later");
    expect(deliberateLaterCommand.idempotentReplay).toBe(false);
  });
});
