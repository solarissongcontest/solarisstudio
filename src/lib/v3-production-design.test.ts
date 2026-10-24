import { describe, expect, it, vi } from "vitest";
import {
  applyProductionDesign,
  createProductionDesignCommandIdentity,
  loadProductionDesignProjection,
  reconcileProductionDesignOperation,
  type ProductionDesignRpcClient,
} from "./v3-production-design";

function clientWithResponses(...responses: Array<{ data: unknown; error: null }>): ProductionDesignRpcClient {
  const rpc = vi.fn();
  for (const response of responses) rpc.mockResolvedValueOnce(response);
  return { rpc };
}

describe("V3 Production Design client authority adapter", () => {
  it("creates one stable operation/idempotency identity for the reviewed command", () => {
    const identity = createProductionDesignCommandIdentity(
      {
        editionId: "edition-22",
        mode: "show_override",
        showId: "final",
      },
      () => "11111111-1111-4111-8111-111111111111",
    );

    expect(identity).toEqual({
      operationId: "11111111-1111-4111-8111-111111111111",
      idempotencyKey:
        "production-design:show_override:edition-22:final:11111111-1111-4111-8111-111111111111",
    });
  });

  it("fails closed before a show-scoped command can be created without a show", () => {
    expect(() =>
      createProductionDesignCommandIdentity(
        { editionId: "edition-22", mode: "show_reset" },
        () => "11111111-1111-4111-8111-111111111111",
      )
    ).toThrow("show is required");
  });

  it("loads the exact-edition server projection instead of deriving a browser state version", async () => {
    const client = clientWithResponses({
      data: {
        schemaVersion: 1,
        editionId: "edition-22",
        showId: null,
        stateVersion: "a".repeat(64),
        state: { shows: [] },
        serverTime: "2026-10-20T06:30:00Z",
      },
      error: null,
    });

    await expect(
      loadProductionDesignProjection({ editionId: "edition-22" }, client),
    ).resolves.toMatchObject({
      editionId: "edition-22",
      stateVersion: "a".repeat(64),
    });

    expect(client.rpc).toHaveBeenCalledWith(
      "admin_production_design_projection",
      { p_edition_id: "edition-22", p_show_id: null },
    );
  });

  it("sends the reviewed state version and one operation identity to the atomic command", async () => {
    const client = clientWithResponses({
      data: {
        ok: true,
        mode: "edition_default",
        editionId: "edition-22",
        showId: null,
        affectedShowIds: ["semi-1", "final"],
        stateVersion: "b".repeat(64),
        operationId: "op-1",
        receiptId: "op-1",
        replayed: false,
        serverTime: "2026-10-20T06:31:00Z",
      },
      error: null,
    });

    const result = await applyProductionDesign(
      {
        editionId: "edition-22",
        request: {
          mode: "edition_default",
          themeConfig: { colors: { primary: "#fff" } },
          broadcastConfig: { lowerThird: true },
          scoreboardConfig: { columns: 2 },
          showConfigs: [
            {
              showId: "semi-1",
              broadcastConfig: { lowerThird: true },
              scoreboardConfig: { columns: 2 },
            },
            {
              showId: "final",
              broadcastConfig: { lowerThird: true },
              scoreboardConfig: { columns: 2 },
            },
          ],
        },
        expectedStateVersion: "a".repeat(64),
        operationId: "op-1",
        idempotencyKey: "idem-1",
        reason: "Apply reviewed edition package",
      },
      client,
    );

    expect(result).toMatchObject({
      ok: true,
      operationId: "op-1",
      receiptId: "op-1",
      replayed: false,
    });
    expect(client.rpc).toHaveBeenCalledWith(
      "admin_apply_production_design",
      expect.objectContaining({
        p_edition_id: "edition-22",
        p_expected_state_version: "a".repeat(64),
        p_operation_id: "op-1",
        p_idempotency_key: "idem-1",
        p_reason: "Apply reviewed edition package",
      }),
    );
  });

  it("preserves a server failure receipt instead of pretending the mutation succeeded", async () => {
    const client = clientWithResponses({
      data: {
        ok: false,
        replayed: true,
        operationId: "op-2",
        correlationId: "op-2",
        status: "failed",
        error: {
          code: "VERSION_CONFLICT",
          metadata: { currentStateVersion: "b".repeat(64) },
        },
      },
      error: null,
    });

    await expect(
      applyProductionDesign(
        {
          editionId: "edition-22",
          request: {
            mode: "show_reset",
            showId: "final",
            broadcastConfig: {},
            scoreboardConfig: {},
          },
          expectedStateVersion: "a".repeat(64),
          operationId: "op-2",
          idempotencyKey: "idem-2",
        },
        client,
      ),
    ).resolves.toMatchObject({
      ok: false,
      operationId: "op-2",
      status: "failed",
      error: { code: "VERSION_CONFLICT" },
    });
  });

  it("reconciles uncertain outcomes through the canonical S2 operation endpoint", async () => {
    const client = clientWithResponses({
      data: {
        operationId: "op-3",
        status: "succeeded",
        result: { ok: true },
      },
      error: null,
    });

    await expect(
      reconcileProductionDesignOperation("op-3", client),
    ).resolves.toMatchObject({ status: "succeeded" });

    expect(client.rpc).toHaveBeenCalledWith("studio2_reconcile_operation", {
      p_operation_id: "op-3",
    });
  });
});
