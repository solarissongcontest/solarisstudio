import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Solaris app notification foundation", () => {
  it("stores push subscriptions under the authenticated user boundary", () => {
    const sql = source("supabase/migrations/20260929214500_solaris_app_push_foundation.sql");
    expect(sql).toContain("app_push_subscriptions");
    expect(sql).toContain("(select auth.uid()) = user_id");
    expect(sql).toContain("unique (user_id, endpoint)");
    expect(sql).toContain("notification_deliveries");
    expect(sql).toContain("unique (user_id, dedupe_key)");
    expect(sql).toContain("solaris_enqueue_app_notifications");
    expect(sql).toContain("confirmation.deadline_1h");
    expect(sql).toContain("jury.opened");
    expect(sql).toContain("televote.opened");
  });

  it("requires a server-provided VAPID public key and never embeds private push keys", () => {
    const client = source("src/lib/app-notifications.ts");
    expect(client).toContain("VITE_WEB_PUSH_PUBLIC_KEY");
    expect(client).not.toMatch(/PRIVATE_KEY|VAPID_PRIVATE/i);
  });

  it("keeps the push sender server-only and respects quiet hours", () => {
    const edge = source("supabase/functions/solaris-push-dispatch/index.ts");
    const server = source("src/server.ts");
    const wrangler = source("wrangler.jsonc");
    expect(edge).toContain("SOLARIS_PUSH_DISPATCH_SECRET");
    expect(edge).toContain("WEB_PUSH_VAPID_PRIVATE_KEY");
    expect(edge).toContain("inQuietHours");
    expect(edge).toContain("urgent_deadline_reminders");
    expect(server).toContain("dispatchScheduledNotifications");
    expect(wrangler).toContain('"crons": ["*/15 * * * *"]');
  });

  it("claims push deliveries atomically before sending and recovers abandoned leases", () => {
    const lease = source(
      "supabase/migrations/20261002194500_organisation_os_v5_push_queue_leasing.sql",
    );
    const edge = source("supabase/functions/solaris-push-dispatch/index.ts");

    expect(lease).toContain("for update skip locked");
    expect(lease).toContain("status = 'processing'");
    expect(lease).toContain("processing_started_at < p_now - interval '10 minutes'");
    expect(lease).toContain("admin_retry_failed_notification_delivery");
    expect(edge).toContain("solaris_claim_pending_notification_deliveries");
    expect(edge).toContain('.eq("status", "processing")');
    expect(edge).not.toContain('.eq("status", "pending")\n    .lte("scheduled_for"');
  });

  it("keeps deadline reminders conditional on the task still requiring action", () => {
    const engine = source("src/lib/notification-engine.ts");
    expect(engine).toContain("!task.actionRequired");
    expect(engine).toContain('task.state === "completed"');
    expect(engine).toContain("dedupeKey");
  });
});
