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
  });

  it("requires a server-provided VAPID public key and never embeds private push keys", () => {
    const client = source("src/lib/app-notifications.ts");
    expect(client).toContain("VITE_WEB_PUSH_PUBLIC_KEY");
    expect(client).not.toMatch(/PRIVATE_KEY|VAPID_PRIVATE/i);
  });

  it("keeps deadline reminders conditional on the task still requiring action", () => {
    const engine = source("src/lib/notification-engine.ts");
    expect(engine).toContain("!task.actionRequired");
    expect(engine).toContain('task.state === "completed"');
    expect(engine).toContain("dedupeKey");
  });
});
