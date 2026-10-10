import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  describeAppPushDelivery,
  type AppPushState,
} from "@/lib/app-notifications";

const state = (overrides: Partial<AppPushState>): AppPushState => ({
  supported: true,
  configured: true,
  permission: "default",
  subscribed: false,
  ...overrides,
});

describe("Solaris V6 notification delivery degradation", () => {
  it.each([
    state({ subscribed: true, permission: "granted" }),
    state({ subscribed: false }),
    state({ subscribed: false, permission: "denied" }),
    state({ supported: false, permission: "unsupported" }),
    state({ configured: false }),
  ])("keeps canonical required work available in every push state", (push) => {
    expect(describeAppPushDelivery(push).requiredWorkAvailable).toBe(true);
  });

  it("labels push as projection-only when delivery is unavailable", () => {
    expect(
      describeAppPushDelivery(state({ configured: false })).mode,
    ).toBe("unconfigured");
    expect(
      describeAppPushDelivery(
        state({ supported: false, permission: "unsupported" }),
      ).mode,
    ).toBe("unsupported");
    expect(
      describeAppPushDelivery(state({ permission: "denied" })).mode,
    ).toBe("permission-denied");
  });

  it("provides visible fallback routes to canonical work surfaces", () => {
    const panel = readFileSync(
      "src/components/mysolaris/MySolarisNotificationsPanel.tsx",
      "utf8",
    );
    expect(panel).toContain('data-solaris-required-work-fallback=""');
    expect(panel).toContain('to="/my-solaris/tasks"');
    expect(panel).toContain('to="/my-solaris/notices"');
    expect(panel).toContain("describeAppPushDelivery");
  });
});
