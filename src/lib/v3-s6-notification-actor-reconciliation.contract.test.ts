import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { V3_PROJECTION_RECONCILIATION_REGISTRY } from "./v3-projection-reconciliation-registry";
import { V3_NOTIFICATION_TASK_EVENT_TYPES } from "@/integrations/notifications/reconcile.server";

const source = readFileSync(
  resolve(process.cwd(), "src/integrations/notifications/reconcile.server.ts"),
  "utf8",
);

describe("System V3 S6 actor-bounded notification reconciliation contract", () => {
  it("never delegates actor repair to the legacy global enqueue writer", () => {
    expect(source).not.toContain("solaris_enqueue_app_notifications");
    expect(source).toContain('.eq("user_id", userId)');
    expect(source).toContain('.eq("status", "pending")');
    expect(source).toContain("V3_NOTIFICATION_RECONCILIATION_MAX_BATCH = 100");
    expect(source).toContain("for (const delivery of page.rows)");
    expect(source).not.toContain("Promise.all(page.rows");
  });

  it("uses an explicit actionable reminder vocabulary instead of every confirmation event", () => {
    expect(V3_NOTIFICATION_TASK_EVENT_TYPES).toEqual([
      "confirmation.opens_soon",
      "confirmation.opened",
      "confirmation.deadline_3d",
      "confirmation.deadline_24h",
      "confirmation.deadline_3h",
      "confirmation.deadline_1h",
      "jury.opened",
      "televote.opened",
    ]);
    expect(V3_NOTIFICATION_TASK_EVENT_TYPES).not.toContain("confirmation.review_accepted");
    expect(source).toContain('.in("event_type", [...V3_NOTIFICATION_TASK_EVENT_TYPES])');
    expect(source).not.toContain("event_type.like.confirmation.%");
  });

  it("scopes the mutation itself as well as the initial read", () => {
    expect(source).toContain('.eq("id", deliveryId)');
    expect(source).toContain('.eq("user_id", userId)');
    expect(source).toContain('status: "suppressed"');
    expect(source).toContain("Scoped loader returned a delivery owned by another actor.");
  });

  it("keeps verification read-only with an explicit diagnostic ceiling", () => {
    const verifierStart = source.indexOf(
      "export async function verifyActorPendingTaskNotificationsWithDependencies",
    );
    expect(verifierStart).toBeGreaterThanOrEqual(0);
    const verifierEnd = source.indexOf(
      "export async function reconcileActorPendingTaskNotificationsInternal",
      verifierStart,
    );
    const verifier = source.slice(verifierStart, verifierEnd);

    expect(source).toContain("V3_NOTIFICATION_RECONCILIATION_VERIFY_MAX_ROWS = 100");
    expect(verifier).toContain('state: "unknown"');
    expect(verifier).toContain('reason: "verification_bound_exceeded"');
    expect(verifier).not.toContain("suppressPendingDelivery(");
    expect(verifier).not.toContain(".update(");
    expect(verifier).not.toContain(".insert(");
    expect(verifier).not.toContain(".delete(");
  });

  it("does not falsely promote the whole Notification projection before missing-candidate reconstruction exists", () => {
    const notificationProjections = V3_PROJECTION_RECONCILIATION_REGISTRY.filter((projection) =>
      projection.canonicalDomains.includes("notification"),
    );

    expect(notificationProjections.length).toBeGreaterThan(0);
    expect(notificationProjections.every((projection) => projection.repair.state === "foundation")).toBe(
      true,
    );
    expect(notificationProjections.every((projection) => projection.repair.rebuildPath === null)).toBe(
      true,
    );
  });
});
