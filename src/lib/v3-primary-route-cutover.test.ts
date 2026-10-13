import { describe, expect, it } from "vitest";

import { shouldLoadV3PrimaryBundle } from "./v3-primary-route-cutover";

describe("Solaris Studio V3 primary route cutover eligibility", () => {
  it("never loads the V3 bootstrap for the public web experience", () => {
    expect(
      shouldLoadV3PrimaryBundle({
        isAppMode: false,
        surface: "home",
        rolloutEnabled: true,
        rolloutUserId: "user-1",
      }),
    ).toBe(false);
  });

  it("never loads the V3 bootstrap while the persisted rollout is disabled", () => {
    expect(
      shouldLoadV3PrimaryBundle({
        isAppMode: true,
        surface: "home",
        rolloutEnabled: false,
        rolloutUserId: "user-1",
      }),
    ).toBe(false);
  });

  it("allows public Home after the server rollout probe enables V3", () => {
    expect(
      shouldLoadV3PrimaryBundle({
        isAppMode: true,
        surface: "home",
        rolloutEnabled: true,
        rolloutUserId: null,
      }),
    ).toBe(true);
  });

  it("keeps signed-out Participate on legacy without loading both data graphs", () => {
    expect(
      shouldLoadV3PrimaryBundle({
        isAppMode: true,
        surface: "participate",
        rolloutEnabled: true,
        rolloutUserId: null,
      }),
    ).toBe(false);
  });

  it("allows signed-in Participate after the server rollout probe enables V3", () => {
    expect(
      shouldLoadV3PrimaryBundle({
        isAppMode: true,
        surface: "participate",
        rolloutEnabled: true,
        rolloutUserId: "user-1",
      }),
    ).toBe(true);
  });
});
