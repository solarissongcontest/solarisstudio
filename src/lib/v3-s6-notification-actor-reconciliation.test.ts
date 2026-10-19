import { describe, expect, it, vi } from "vitest";
import {
  V3_NOTIFICATION_RECONCILIATION_MAX_BATCH,
  V3_NOTIFICATION_RECONCILIATION_VERIFY_MAX_ROWS,
  reconcileActorPendingTaskNotificationsWithDependencies,
  verifyActorPendingTaskNotificationsWithDependencies,
  type ActorNotificationReconciliationDependencies,
  type ReconciledNotificationDelivery,
} from "@/integrations/notifications/reconcile.server";

const actor = "11111111-1111-4111-8111-111111111111";
const otherActor = "22222222-2222-4222-8222-222222222222";

function delivery(
  id: string,
  userId = actor,
  eventType = "confirmation.opened",
): ReconciledNotificationDelivery {
  return {
    id,
    user_id: userId,
    event_type: eventType,
    subject_id: "33333333-3333-4333-8333-333333333333",
    status: "pending",
  };
}

function dependencies(
  rows: ReconciledNotificationDelivery[],
  staleIds: readonly string[],
  total = rows.length,
): ActorNotificationReconciliationDependencies {
  const stale = new Set(staleIds);
  return {
    loadPendingTaskDeliveries: vi.fn(async (userId: string, limit: number) => ({
      rows: rows.filter((row) => row.user_id === userId).slice(0, limit),
      total,
    })),
    evaluateDeliveryTruth: vi.fn(async (_userId, row) => ({
      suppress: stale.has(row.id),
      reason: stale.has(row.id) ? "canonical state resolved" : null,
    })),
    suppressPendingDelivery: vi.fn(async (userId, id) =>
      rows.some((row) => row.id === id && row.user_id === userId && row.status === "pending"),
    ),
  };
}

describe("System V3 S6 actor-bounded notification reconciliation", () => {
  it("suppresses only stale pending deliveries owned by the requested actor", async () => {
    const ownStale = delivery("44444444-4444-4444-8444-444444444444");
    const ownValid = delivery("55555555-5555-4555-8555-555555555555", actor, "jury.opened");
    const foreign = delivery("66666666-6666-4666-8666-666666666666", otherActor);
    const deps = dependencies([ownStale, ownValid, foreign], [ownStale.id, foreign.id], 2);

    const result = await reconcileActorPendingTaskNotificationsWithDependencies(
      actor,
      { limit: 25 },
      deps,
    );

    expect(result).toMatchObject({
      userId: actor,
      totalPendingTaskDeliveries: 2,
      scanned: 2,
      suppressed: 1,
      unchanged: 1,
      failed: 0,
      hasMore: false,
    });
    expect(deps.loadPendingTaskDeliveries).toHaveBeenCalledWith(actor, 25);
    expect(deps.suppressPendingDelivery).toHaveBeenCalledTimes(1);
    expect(deps.suppressPendingDelivery).toHaveBeenCalledWith(
      actor,
      ownStale.id,
      "canonical state resolved",
    );
    expect(deps.suppressPendingDelivery).not.toHaveBeenCalledWith(
      otherActor,
      expect.anything(),
      expect.anything(),
    );
  });

  it("fails closed if a scoped loader leaks another actor's row", async () => {
    const foreign = delivery("77777777-7777-4777-8777-777777777777", otherActor);
    const deps = dependencies([], []);
    deps.loadPendingTaskDeliveries = vi.fn(async () => ({ rows: [foreign], total: 1 }));

    const result = await reconcileActorPendingTaskNotificationsWithDependencies(
      actor,
      { limit: 1 },
      deps,
    );

    expect(result.failed).toBe(1);
    expect(result.failures[0]).toMatchObject({ deliveryId: foreign.id });
    expect(result.failures[0].message).toContain("another actor");
    expect(deps.suppressPendingDelivery).not.toHaveBeenCalled();
  });

  it("rejects repair batches larger than the canonical actor ceiling before loading data", async () => {
    const deps = dependencies([], []);

    await expect(
      reconcileActorPendingTaskNotificationsWithDependencies(
        actor,
        { limit: V3_NOTIFICATION_RECONCILIATION_MAX_BATCH + 1 },
        deps,
      ),
    ).rejects.toThrow("Expected notification reconciliation batch between 1 and 100.");

    expect(deps.loadPendingTaskDeliveries).not.toHaveBeenCalled();
  });

  it("reports explicit continuation when the actor has more pending task deliveries than the page", async () => {
    const rows = [delivery("88888888-8888-4888-8888-888888888888")];
    const deps = dependencies(rows, [], 3);

    const result = await reconcileActorPendingTaskNotificationsWithDependencies(
      actor,
      { limit: 1 },
      deps,
    );

    expect(result).toMatchObject({ scanned: 1, totalPendingTaskDeliveries: 3, hasMore: true });
  });

  it("keeps verification read-only and independently reports stale pending delivery ids", async () => {
    const stale = delivery("99999999-9999-4999-8999-999999999999", actor, "televote.opened");
    const valid = delivery("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    const deps = dependencies([stale, valid], [stale.id]);

    const result = await verifyActorPendingTaskNotificationsWithDependencies(actor, deps);

    expect(result).toMatchObject({
      userId: actor,
      state: "drift",
      reason: "verified",
      totalPendingTaskDeliveries: 2,
      stalePendingDeliveryIds: [stale.id],
    });
    expect(deps.suppressPendingDelivery).not.toHaveBeenCalled();
  });

  it("refuses to certify actors above the bounded verification ceiling", async () => {
    const deps = dependencies([], [], V3_NOTIFICATION_RECONCILIATION_VERIFY_MAX_ROWS + 1);

    const result = await verifyActorPendingTaskNotificationsWithDependencies(actor, deps);

    expect(result).toMatchObject({
      state: "unknown",
      reason: "verification_bound_exceeded",
      totalPendingTaskDeliveries: 101,
      stalePendingDeliveryIds: [],
    });
    expect(deps.evaluateDeliveryTruth).not.toHaveBeenCalled();
    expect(deps.suppressPendingDelivery).not.toHaveBeenCalled();
  });
});
