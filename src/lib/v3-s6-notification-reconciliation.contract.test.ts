import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { V3_PROJECTION_RECONCILIATION_REGISTRY } from "./v3-projection-reconciliation-registry";
import { V3_NOTIFICATION_PROVIDER_REGISTRY } from "./v3-notification-provider-registry";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261019113000_v3_s6_notification_reconciliation.sql",
  ),
  "utf8",
);

function functionBody(name: string) {
  const marker = `function ${name}`;
  const start = migration.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const bodyStart = migration.indexOf("as $", start);
  expect(bodyStart).toBeGreaterThan(start);
  const delimiterStart = bodyStart + 4;
  const delimiterEnd = migration.indexOf("$", delimiterStart);
  const delimiter = migration.slice(bodyStart + 3, delimiterEnd + 1);
  const bodyEnd = migration.indexOf(delimiter, delimiterEnd + 1);
  expect(bodyEnd).toBeGreaterThan(delimiterEnd);
  return migration.slice(start, bodyEnd + delimiter.length);
}

describe("System V3 S6 notification reconciliation", () => {
  it("uses one candidate engine for ordinary enqueue and exact-recipient repair", () => {
    const globalEnqueue = functionBody("public.solaris_enqueue_app_notifications");
    const repair = functionBody("public.studio2_reconcile_notification_delivery_projection");

    expect(migration).toContain("private.solaris_expected_notification_deliveries");
    expect(globalEnqueue).toContain(
      "private.solaris_expected_notification_deliveries(null, p_now)",
    );
    expect(repair).toContain(
      "private.solaris_expected_notification_deliveries(p_user_id, p_now)",
    );
    expect(repair).not.toContain("solaris_enqueue_app_notifications");
  });

  it("keeps every registered provider represented in canonical candidate generation", () => {
    for (const provider of V3_NOTIFICATION_PROVIDER_REGISTRY) {
      for (const eventType of provider.eventTypes) {
        if (eventType.endsWith(".*")) continue;
        expect(migration).toContain(eventType);
      }
    }
    expect(migration).toContain("follow.notification_level");
    expect(migration).toContain("organizer_task.critical");
    expect(migration).toContain("organizer_task.high");
  });

  it("makes recipient scope explicit throughout every fan-out source", () => {
    const candidates = functionBody("private.solaris_expected_notification_deliveries");
    const recipientGuards = candidates.match(/p_user_id is null or/g) ?? [];

    expect(recipientGuards.length).toBeGreaterThanOrEqual(9);
    expect(candidates).toContain("ca.user_id = p_user_id");
    expect(candidates).toContain("preference.profile_id = p_user_id");
    expect(candidates).toContain("receipt.recipient_user_id = p_user_id");
    expect(candidates).toContain("follow.profile_id = p_user_id");
    expect(candidates).toContain("notification.recipient_id = p_user_id");
  });

  it("bounds repair and verification independently", () => {
    const repair = functionBody("public.studio2_reconcile_notification_delivery_projection");
    const verify = functionBody("public.studio2_verify_notification_delivery_projection");

    expect(repair).toContain("p_limit > 100");
    expect(repair).toContain("Notification reconciliation bound exceeded");
    expect(repair).toContain("errcode = '54000'");
    expect(verify).toContain("p_limit > 500");
    expect(verify).toContain("verification_bound_exceeded");
    expect(verify).toContain("'state', 'unknown'");
  });

  it("keeps verification read-only and service-only", () => {
    const verify = functionBody("public.studio2_verify_notification_delivery_projection");

    expect(verify).toContain("private.studio2_request_is_service_role()");
    expect(verify).not.toMatch(/\binsert\s+into\b/i);
    expect(verify).not.toMatch(/\bupdate\s+public\./i);
    expect(verify).not.toMatch(/\bdelete\s+from\b/i);
    expect(migration).toContain(
      "grant execute on function public.studio2_verify_notification_delivery_projection(uuid, timestamptz, integer)\n  to service_role",
    );
    expect(migration).toContain(
      "grant execute on function public.studio2_reconcile_notification_delivery_projection(uuid, timestamptz, integer)\n  to service_role",
    );
  });

  it("preserves stable user plus dedupe-key idempotency and stale pending suppression", () => {
    expect(migration).toContain("on conflict (user_id, dedupe_key) do nothing");
    expect(migration).toContain("private.solaris_stale_notification_delivery_ids");
    expect(migration).toContain("delivery.status = 'pending'");
    expect(migration).toContain("status = 'suppressed'");
    expect(migration).toContain("task.state <> 'resolved'");
  });

  it("is governed by the S13 migration framework", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("20261019113000_v3_s6_notification_reconciliation");
    expect(migration).toContain("'forward_fix_only'");
  });

  it("promotes notification projections only to rebuildable after bounded repair and verification exist", () => {
    const notification = V3_PROJECTION_RECONCILIATION_REGISTRY.filter((projection) =>
      projection.canonicalDomains.includes("notification"),
    );

    expect(notification.length).toBeGreaterThan(0);
    expect(notification.every((projection) => projection.repair.state === "rebuildable")).toBe(true);
    expect(notification.every((projection) => projection.repair.scope === "actor")).toBe(true);
    expect(notification.every((projection) => Boolean(projection.repair.rebuildPath))).toBe(true);
    expect(notification.every((projection) => Boolean(projection.repair.verificationPath))).toBe(true);
    expect(notification.every((projection) => Boolean(projection.repair.boundedBy))).toBe(true);
    expect(notification.some((projection) => projection.repair.state === "verified")).toBe(false);
  });
});
