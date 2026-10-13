import { describe, expect, it } from "vitest";

import {
  resolveV3PrimarySurface,
  shouldLoadV3PrimaryBundle,
} from "./v3-primary-route-cutover";

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

describe("Solaris Studio V3 primary route ownership", () => {
  it("lets the canonical Participate pathname override a retained Home gate", () => {
    expect(resolveV3PrimarySurface("home", "/participate")).toBe("participate");
    expect(resolveV3PrimarySurface("home", "/participate/")).toBe("participate");
  });

  it("lets the canonical Home pathname override a retained Participate gate", () => {
    expect(resolveV3PrimarySurface("participate", "/")).toBe("home");
  });

  it("does not claim nested or unrelated routes", () => {
    expect(resolveV3PrimarySurface("home", "/confirmations")).toBe("home");
    expect(resolveV3PrimarySurface("participate", "/results")).toBe("participate");
  });
});
