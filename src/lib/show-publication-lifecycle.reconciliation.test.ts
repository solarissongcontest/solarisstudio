import { describe, expect, it, vi } from "vitest";

import {
  applyShowPublicationChange,
  reconcileShowPublicationChange,
  type ShowPublicationPreview,
} from "./show-publication-lifecycle";

const config = {
  participants: true,
  artists: true,
  songs: true,
  semi_split: false,
  running_order: true,
  qualifiers: false,
  results: false,
  jury_results: false,
  televote_results: false,
  detailed_voting: false,
};

function preview(overrides: Partial<ShowPublicationPreview> = {}): ShowPublicationPreview {
  return {
    showId: "11111111-1111-4111-8111-111111111111",
    editionId: "22222222-2222-4222-8222-222222222222",
    currentState: "draft",
    targetState: "public",
    expectedVersion: 7,
    alreadyApplied: false,
    riskClass: "R2",
    config,
    scheduledFor: null,
    sourceShowUpdatedAt: "2026-10-25T00:00:00.000Z",
    sourceResultVersion: null,
    hasOutcomes: false,
    resultReleaseReady: true,
    integrityClear: true,
    ...overrides,
  };
}

function receipt(operationId: string, currentPreview = preview()) {
  return {
    ok: true,
    alreadyApplied: false,
    operationId,
    showId: currentPreview.showId,
    state: currentPreview.targetState,
    version: currentPreview.expectedVersion + 1,
    scheduledFor: currentPreview.scheduledFor,
  };
}

function succeededReconciliation(operationId: string, currentPreview = preview()) {
  return {
    operationId,
    correlationId: "33333333-3333-4333-8333-333333333333",
    command: "publication.show.change",
    status: "succeeded",
    result: receipt(operationId, currentPreview),
    error: null,
    createdAt: "2026-10-25T00:00:00.000Z",
    updatedAt: "2026-10-25T00:00:01.000Z",
    completedAt: "2026-10-25T00:00:01.000Z",
  };
}

describe("Organizer publication lost-response reconciliation", () => {
  it("keeps the normal success path to one mutation request", async () => {
    const operationId = "44444444-4444-4444-8444-444444444441";
    const currentPreview = preview();
    const rpc = vi.fn().mockResolvedValue({
      data: receipt(operationId, currentPreview),
      error: null,
    });

    const result = await applyShowPublicationChange(
      { preview: currentPreview, operationId, idempotencyKey: operationId },
      { rpc },
    );

    expect(result.operationId).toBe(operationId);
    expect(result.version).toBe(8);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("studio2_apply_show_publication_change", {
      p_show_id: currentPreview.showId,
      p_target_state: "public",
      p_config: config,
      p_scheduled_for: null,
      p_operation_id: operationId,
      p_idempotency_key: operationId,
      p_expected_version: 7,
    });
  });

  it("recovers a committed mutation from the actor-scoped operation receipt", async () => {
    const operationId = "44444444-4444-4444-8444-444444444442";
    const currentPreview = preview();
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: new Error("Failed to fetch") })
      .mockResolvedValueOnce({
        data: succeededReconciliation(operationId, currentPreview),
        error: null,
      });

    const result = await applyShowPublicationChange(
      { preview: currentPreview, operationId, idempotencyKey: operationId },
      { rpc },
    );

    expect(result).toMatchObject({
      operationId,
      showId: currentPreview.showId,
      state: "public",
      version: 8,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "studio2_reconcile_operation", {
      p_operation_id: operationId,
    });
  });

  it("never issues a second mutation after an ambiguous response until reconciliation settles", async () => {
    const operationId = "44444444-4444-4444-8444-444444444443";
    const currentPreview = preview();
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: new Error("connection reset") })
      .mockResolvedValueOnce({
        data: null,
        error: { code: "P0002", message: "UNKNOWN" },
      })
      .mockResolvedValueOnce({
        data: succeededReconciliation(operationId, currentPreview),
        error: null,
      });

    await expect(
      applyShowPublicationChange(
        { preview: currentPreview, operationId, idempotencyKey: operationId },
        { rpc },
      ),
    ).rejects.toThrow("connection reset");

    const recovered = await applyShowPublicationChange(
      { preview: currentPreview, operationId, idempotencyKey: operationId },
      { rpc },
    );

    expect(recovered.operationId).toBe(operationId);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "studio2_apply_show_publication_change",
      "studio2_reconcile_operation",
      "studio2_reconcile_operation",
    ]);
  });

  it("fails closed when reconciliation belongs to a different command", async () => {
    const operationId = "44444444-4444-4444-8444-444444444444";
    const currentPreview = preview();
    const rpc = vi.fn().mockResolvedValue({
      data: {
        ...succeededReconciliation(operationId, currentPreview),
        command: "results.publish",
      },
      error: null,
    });

    await expect(
      reconcileShowPublicationChange(
        { preview: currentPreview, operationId },
        { rpc },
      ),
    ).rejects.toThrow("different command");
  });

  it("rejects a recovered receipt that does not match the exact reviewed show and version", async () => {
    const operationId = "44444444-4444-4444-8444-444444444445";
    const currentPreview = preview();
    const rpc = vi.fn().mockResolvedValue({
      data: {
        ...succeededReconciliation(operationId, currentPreview),
        result: {
          ...receipt(operationId, currentPreview),
          showId: "99999999-9999-4999-8999-999999999999",
        },
      },
      error: null,
    });

    await expect(
      reconcileShowPublicationChange(
        { preview: currentPreview, operationId },
        { rpc },
      ),
    ).rejects.toThrow("different show");
  });

  it("does not convert a deterministic server rejection into an ambiguous operation", async () => {
    const operationId = "44444444-4444-4444-8444-444444444446";
    const currentPreview = preview();
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: { code: "40001", message: "Publication changed" },
      })
      .mockResolvedValueOnce({
        data: receipt(operationId, currentPreview),
        error: null,
      });

    await expect(
      applyShowPublicationChange(
        { preview: currentPreview, operationId, idempotencyKey: operationId },
        { rpc },
      ),
    ).rejects.toThrow("Publication changed");

    const secondAttempt = await applyShowPublicationChange(
      { preview: currentPreview, operationId, idempotencyKey: operationId },
      { rpc },
    );

    expect(secondAttempt.operationId).toBe(operationId);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "studio2_apply_show_publication_change",
      "studio2_apply_show_publication_change",
    ]);
  });
});