import { describe, expect, it, vi } from "vitest";

import {
  applyAnniversaryDateChange,
  loadAnniversaryDateSnapshot,
  sameAnniversaryDateSnapshot,
  type AnniversaryDateChangeRequest,
  type AnniversaryDateRpcClient,
  type AnniversaryDateSnapshot,
} from "./v3-organizer-anniversary-date";

const snapshot: AnniversaryDateSnapshot = {
  editionId: "11111111-1111-4111-8111-111111111111",
  editionNumber: 22,
  editionName: "Solaris Song Contest 22",
  eventDate: "2026-09-17",
  year: 2026,
  serverTime: "2026-10-25T00:00:00Z",
};

const request: AnniversaryDateChangeRequest = {
  snapshot,
  eventDate: "2026-09-18",
  reason: "Correct archive date from the official programme",
  operation: {
    operationId: "22222222-2222-4222-8222-222222222222",
    idempotencyKey: "anniversary-date:test",
    correlationId: "33333333-3333-4333-8333-333333333333",
  },
};

function result() {
  return {
    ok: true,
    operationId: request.operation.operationId,
    editionId: snapshot.editionId,
    editionNumber: snapshot.editionNumber,
    editionName: snapshot.editionName,
    reason: request.reason,
    before: { eventDate: snapshot.eventDate, year: snapshot.year },
    after: { eventDate: request.eventDate, year: 2026 },
    serverTime: "2026-10-25T00:01:00Z",
  };
}

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    operationId: request.operation.operationId,
    command: "edition.anniversary_date.update",
    status: "succeeded",
    result: result(),
    ...overrides,
  };
}

describe("V3 Organizer Anniversary date authority client", () => {
  it("loads and validates the exact server-owned edition snapshot", async () => {
    const rpc = vi.fn(async () => ({ data: snapshot, error: null }));
    const loaded = await loadAnniversaryDateSnapshot(snapshot.editionId, { rpc } as AnniversaryDateRpcClient);

    expect(loaded).toEqual(snapshot);
    expect(rpc).toHaveBeenCalledWith("studio2_anniversary_date_snapshot", {
      p_edition_id: snapshot.editionId,
    });
    expect(sameAnniversaryDateSnapshot(loaded, snapshot)).toBe(true);
  });

  it("commits only through the governed command with the reviewed baseline and stable identity", async () => {
    const rpc = vi.fn(async () => ({ data: receipt(), error: null }));
    const applied = await applyAnniversaryDateChange(request, { rpc } as AnniversaryDateRpcClient);

    expect(applied.operationId).toBe(request.operation.operationId);
    expect(applied.after).toEqual({ eventDate: "2026-09-18", year: 2026 });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("studio2_set_anniversary_date", {
      p_edition_id: snapshot.editionId,
      p_event_date: request.eventDate,
      p_expected_event_date: snapshot.eventDate,
      p_expected_year: snapshot.year,
      p_reason: request.reason,
      p_operation_id: request.operation.operationId,
      p_idempotency_key: request.operation.idempotencyKey,
      p_correlation_id: request.operation.correlationId,
    });
  });

  it("reconciles the same operation exactly once after an uncertain mutation response", async () => {
    const transportError = { message: "network response lost" };
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: transportError })
      .mockResolvedValueOnce({ data: receipt(), error: null });

    const applied = await applyAnniversaryDateChange(request, { rpc } as AnniversaryDateRpcClient);

    expect(applied.replayed).toBe(true);
    expect(rpc).toHaveBeenNthCalledWith(2, "studio2_reconcile_operation", {
      p_operation_id: request.operation.operationId,
    });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("does not accept a successful receipt for a different reviewed target", async () => {
    const mismatched = receipt({
      result: {
        ...result(),
        after: { eventDate: "2026-09-19", year: 2026 },
      },
    });
    const rpc = vi.fn(async () => ({ data: mismatched, error: null }));

    await expect(
      applyAnniversaryDateChange(request, { rpc } as AnniversaryDateRpcClient),
    ).rejects.toThrow("reviewed target date");
  });

  it("preserves the separately meaningful year when the exact date is cleared", async () => {
    const clearRequest: AnniversaryDateChangeRequest = { ...request, eventDate: null };
    const rpc = vi.fn(async () => ({
      data: receipt({
        result: {
          ...result(),
          after: { eventDate: null, year: snapshot.year },
        },
      }),
      error: null,
    }));

    const applied = await applyAnniversaryDateChange(clearRequest, { rpc } as AnniversaryDateRpcClient);
    expect(applied.after).toEqual({ eventDate: null, year: 2026 });
  });
});
