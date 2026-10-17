import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { v3DomainConsequence } from "./v3-domain-consequence-registry";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const migration = source(
  "supabase/migrations/20261016063000_v3_s5_notification_consequences.sql",
);
const rehearsal = source(
  ".github/scripts/v3-s5-notification-consequences-rehearsal.sh",
);

describe("System V3 S5 Notification consequences", () => {
  it("emits queued only for initial queueing or explicit failed retry", () => {
    expect(migration).toContain("if new.status = 'pending' then");
    expect(migration).toContain("old.status = 'failed' and new.status = 'pending'");
    expect(migration).toContain("'notification.queued'");
    expect(migration).toContain("processing leases, quiet-hour deferrals");
  });

  it("emits delivered/failed from durable status transitions with attempt-count versions", () => {
    expect(migration).toContain("'notification.delivered'");
    expect(migration).toContain("'notification.failed'");
    expect(migration).toContain("new.attempt_count::bigint");
    expect(migration).toContain("private.v3_notification_transition_operation_id(");
  });

  it("keeps message content and recipient identity out of DomainEvent payloads", () => {
    expect(migration).not.toContain("'title', new.title");
    expect(migration).not.toContain("'body', new.body");
    expect(migration).not.toContain("'error', new.error");
    expect(migration).not.toContain("'userId', new.user_id");
    expect(migration).toContain("'category', new.category");
    expect(migration).toContain("'sourceEventType', new.event_type");
  });

  it("reconciles one global Organizer Task per failed delivery", () => {
    expect(migration).toContain("'notification-delivery:' || v_delivery.id::text");
    expect(migration).toContain("'notification.delivery_failed'");
    expect(migration).toContain("'system.manage'");
    expect(migration).toContain("case when v_delivery.attempt_count >= 3 then 'critical' else 'high' end");
    expect(migration).toContain("'admin_retry_failed_notification_delivery'");
  });

  it("prevents failure-task notification recursion", () => {
    expect(migration).toContain("v_recursive_failure boolean := false");
    expect(migration).toContain("v_delivery.category = 'organizer_tasks'");
    expect(migration).toContain("parent_task.task_type = 'notification.delivery_failed'");
    expect(migration).toContain("v_delivery.status = 'failed' and not v_recursive_failure");
  });

  it("uses the shared leased replay-safe consumer contract for all notification lifecycle events", () => {
    expect(migration).toContain("array['notification.tasks']::text[]");
    expect(migration).toContain("private.v3_domain_event_consumer_receipts");
    expect(migration).toContain("v_delivery.lease_owner is distinct from p_worker_id");
    expect(migration).toContain("private.v3_reconcile_notification_delivery_task(v_delivery_id)");
    expect(migration).toContain("private.studio2_sync_task_notifications(null)");
    expect(migration).toContain("private.studio2_request_is_service_role()");
  });

  it("keeps the failure task inside Notification domain lifecycle", () => {
    expect(v3DomainConsequence("notice.published")?.taskEffects).toEqual([]);
    for (const eventType of [
      "notification.queued",
      "notification.delivered",
      "notification.failed",
    ]) {
      expect(v3DomainConsequence(eventType)?.taskEffects).toEqual([
        { effect: "re-evaluate", taskType: "notification.delivery_failed" },
      ]);
      expect(v3DomainConsequence(eventType)?.implementationState).toBe("event-backed");
    }
  });

  it("rehearses open, recursive-guard, retry resolution, delivery and replay locally", () => {
    expect(rehearsal).toContain("notification.failed task was not opened");
    expect(rehearsal).toContain("recursive failure created a second-order failure task");
    expect(rehearsal).toContain("retry did not resolve the failure task");
    expect(rehearsal).toContain("notification.delivered event missing");
    expect(rehearsal).toContain("Notification consequence replay was not idempotent");
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
  });
});
