import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = () =>
  readFileSync(resolve(process.cwd(), "src/lib/app-notifications.ts"), "utf8");

describe("V3 push delivery parity", () => {
  it("requires current-user server registration before reporting active delivery", () => {
    const code = source();

    expect(code).toContain("currentPushUserId");
    expect(code).toContain("serverHasSubscription");
    expect(code).toContain('.from("app_push_subscriptions")');
    expect(code).toContain('.eq("user_id", userId)');
    expect(code).toContain('.eq("endpoint", endpoint)');
    expect(code).toContain('.is("disabled_at", null)');
    expect(code).toContain("subscription && resolvedUserId");
    expect(code).not.toContain("subscribed: Boolean(subscription)");
  });

  it("keeps the push-state reader compatible with React Query queryFn callers", () => {
    const code = source();

    expect(code).toContain("export async function getAppPushState(): Promise<AppPushState>");
    expect(code).toContain("await currentPushUserId()");
    expect(code).not.toContain("getAppPushState(userId?");
    expect(code).not.toContain("currentPushUserId(explicitUserId?");
  });

  it("rolls back a brand-new browser subscription when Solaris registration fails", () => {
    const code = source();
    const store = code.indexOf("await storeSubscription(userId, subscription)");
    const rollback = code.indexOf("await subscription.unsubscribe()", store);

    expect(store).toBeGreaterThan(-1);
    expect(rollback).toBeGreaterThan(store);
    expect(code).toContain("if (!existing)");
  });

  it("disables server delivery before removing the browser subscription", () => {
    const code = source();
    const disableStart = code.indexOf("export async function disableAppPush");
    const serverDelete = code.indexOf('.from("app_push_subscriptions")', disableStart);
    const browserUnsubscribe = code.indexOf("await subscription.unsubscribe()", serverDelete);

    expect(disableStart).toBeGreaterThan(-1);
    expect(serverDelete).toBeGreaterThan(disableStart);
    expect(browserUnsubscribe).toBeGreaterThan(serverDelete);
  });

  it("continues to declare required work independent from push delivery", () => {
    const code = source();

    expect(code).toContain("requiredWorkAvailable: true");
    expect(code).toContain("Push is delivery infrastructure, never canonical work state");
  });
});
