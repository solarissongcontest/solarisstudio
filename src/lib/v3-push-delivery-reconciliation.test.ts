import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  describeAppPushDelivery,
  UNKNOWN_APP_PUSH_DELIVERY,
  type AppPushState,
} from "./app-notifications";

const state = (overrides: Partial<AppPushState> = {}): AppPushState => ({
  supported: true,
  configured: true,
  permission: "granted",
  subscribed: false,
  ...overrides,
});

describe("V3 push delivery reconciliation", () => {
  it("does not claim active delivery from a browser-only subscription", () => {
    const delivery = describeAppPushDelivery(
      state({
        subscribed: false,
        browserSubscribed: true,
        serverRegistered: false,
      }),
    );

    expect(delivery.mode).toBe("registration-missing");
    expect(delivery.title).toBe("Push needs repair");
    expect(delivery.requiredWorkAvailable).toBe(true);
  });

  it("keeps an unreadable delivery-health projection explicitly unknown", () => {
    expect(UNKNOWN_APP_PUSH_DELIVERY).toEqual({
      mode: "unknown",
      title: "Push status unavailable",
      description:
        "Solaris could not verify this device's push delivery registration. Required tasks and notices remain available inside Solaris.",
      requiredWorkAvailable: true,
    });

    const route = readFileSync("src/routes/_authenticated/notifications.tsx", "utf8");
    expect(route).toContain("push.isError && !push.data");
    expect(route).toContain("? UNKNOWN_APP_PUSH_DELIVERY");
    expect(route).not.toContain("push.data ?? EMPTY_PUSH");
  });

  it("requires browser and server registration agreement in the authenticated V3 read", () => {
    const client = readFileSync("src/lib/app-notifications.ts", "utf8");
    const route = readFileSync("src/routes/_authenticated/notifications.tsx", "utf8");
    const migration = readFileSync(
      "supabase/migrations/20260929214500_solaris_app_push_foundation.sql",
      "utf8",
    );

    expect(client).toContain("serverHasPushSubscription(userId, subscription.endpoint)");
    expect(client).toContain("browserSubscribed && serverRegistered === true");
    expect(client).toContain('.from("app_push_subscriptions")');
    expect(client).toContain('.eq("user_id", userId)');
    expect(client).toContain('.eq("endpoint", endpoint)');
    expect(client).toContain('.is("disabled_at", null)');
    expect(route).toContain("queryFn: () => getAppPushState(userId)");
    expect(migration).toContain('policy "users read own app push subscriptions"');
    expect(migration).toContain("using ((select auth.uid()) = user_id)");
  });

  it("accepts React Query context without treating the context object as a user id", () => {
    const client = readFileSync("src/lib/app-notifications.ts", "utf8");
    const legacyPanel = readFileSync(
      "src/components/mysolaris/MySolarisNotificationsPanel.tsx",
      "utf8",
    );

    expect(legacyPanel).toContain("queryFn: getAppPushState");
    expect(client).toContain("resolvePushStateUserId");
    expect(client).toContain("input?.queryKey?.[1]");
    expect(client).toContain('typeof candidate === "string"');
  });

  it("keeps legacy callers browser-only until they opt into authenticated reconciliation", () => {
    const client = readFileSync("src/lib/app-notifications.ts", "utf8");

    expect(client).toContain("userId\n      ? browserSubscribed && serverRegistered === true\n      : browserSubscribed");
    expect(client).toContain("serverRegistered: userId ? false : undefined");
  });
});