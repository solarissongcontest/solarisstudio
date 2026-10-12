import { describe, expect, it } from "vitest";

import { decideV3ShellForRoute } from "./v3-shell-route-boundary";
import type { V3RolloutContext, V3RolloutRule } from "./v3-rollout";

const ENABLED: V3RolloutRule = { stage: "enabled" };
const CONTEXT: V3RolloutContext = {
  userId: "user-1",
  editionId: "edition-22",
  isOrganizer: false,
};

function decide(
  pathname: string,
  overrides: Partial<Parameters<typeof decideV3ShellForRoute>[0]> = {},
) {
  return decideV3ShellForRoute({
    pathname,
    rolloutRule: ENABLED,
    rolloutContext: CONTEXT,
    isAuthenticated: true,
    ...overrides,
  });
}

describe("Solaris Studio V3 shell route boundary", () => {
  it("keeps every route on legacy shell when server rollout is disabled", () => {
    const decision = decide("/", {
      rolloutRule: { stage: "disabled" },
    });

    expect(decision.useV3Shell).toBe(false);
    expect(decision.mount).toBe("legacy_shell");
    expect(decision.reason).toBe("disabled");
  });

  it("uses V3 chrome on a known full-tab root without changing its pathname", () => {
    const decision = decide("/results");

    expect(decision.useV3Shell).toBe(true);
    expect(decision.mount).toBe("v3_shell");
    expect(decision.pathname).toBe("/results");
    expect(decision.rootTab).toBe("results");
    expect(decision.reason).toBe("enabled");
  });

  it("preserves deep links while switching only the shell chrome", () => {
    const decision = decide("/countries/oland");

    expect(decision.useV3Shell).toBe(true);
    expect(decision.pathname).toBe("/countries/oland");
    expect(decision.screenId).toBe("countries.entity");
    expect(decision.rootTab).toBe("explore");
  });

  it("honours preview/cohort rollout membership instead of local opt-in", () => {
    const denied = decide("/", {
      rolloutRule: { stage: "preview", userIds: ["other-user"] },
    });
    expect(denied.useV3Shell).toBe(false);
    expect(denied.reason).toBe("preview_not_allowed");

    const allowed = decide("/", {
      rolloutRule: { stage: "cohort", userIds: ["user-1"] },
    });
    expect(allowed.useV3Shell).toBe(true);
  });

  it.each(["/confirmations", "/jury-voting", "/televoting"])(
    "keeps critical workflow %s on its existing focused shell",
    (pathname) => {
      const decision = decide(pathname);
      expect(decision.useV3Shell).toBe(false);
      expect(decision.reason).toBe("critical_task");
    },
  );

  it("keeps immersive and minimal-tab experiences out of the full V3 shell", () => {
    const showMode = decide("/show-mode");
    expect(showMode.useV3Shell).toBe(false);
    expect(showMode.reason).toBe("immersive_screen");

    const broadcast = decide("/broadcast/final");
    expect(broadcast.useV3Shell).toBe(false);
    expect(broadcast.reason).toBe("immersive_screen");
  });

  it.each([
    "/v3-preview",
    "/auth",
    "/auth/callback",
    "/admin",
    "/organizer",
    "/organizer/live",
    "/maintenance",
  ])("explicitly excludes control/special route %s", (pathname) => {
    const decision = decide(pathname);
    expect(decision.useV3Shell).toBe(false);
    expect(decision.reason).toBe("route_excluded");
  });

  it("does not wrap unknown paths merely because the screen registry has a fallback", () => {
    const decision = decide("/definitely-not-a-solaris-route");

    expect(decision.useV3Shell).toBe(false);
    expect(decision.reason).toBe("unknown_screen");
  });

  it("keeps authenticated personal surfaces on legacy until auth is actually present", () => {
    const signedOut = decide("/my-solaris", { isAuthenticated: false });
    expect(signedOut.useV3Shell).toBe(false);
    expect(signedOut.reason).toBe("authentication_required");

    const signedIn = decide("/my-solaris", { isAuthenticated: true });
    expect(signedIn.useV3Shell).toBe(true);
    expect(signedIn.rootTab).toBe("me");
  });

  it("allows known Results data/workspace screens whose canonical chrome is full-tab", () => {
    expect(decide("/scorecharts").useV3Shell).toBe(true);
    expect(decide("/analysis").useV3Shell).toBe(true);
  });

  it("preserves edition cohort restrictions from the shared rollout evaluator", () => {
    const decision = decide("/explore", {
      rolloutRule: {
        stage: "enabled",
        editionIds: ["another-edition"],
      },
    });

    expect(decision.useV3Shell).toBe(false);
    expect(decision.reason).toBe("edition_not_in_cohort");
  });

  it("preserves organizer-only rollout restrictions", () => {
    const denied = decide("/", {
      rolloutRule: { stage: "enabled", organizersOnly: true },
    });
    expect(denied.useV3Shell).toBe(false);
    expect(denied.reason).toBe("organizer_required");

    const allowed = decide("/", {
      rolloutRule: { stage: "enabled", organizersOnly: true },
      rolloutContext: { ...CONTEXT, isOrganizer: true },
    });
    expect(allowed.useV3Shell).toBe(true);
  });

  it("rejects malformed non-absolute route input instead of guessing", () => {
    expect(() => decideV3ShellForRoute({
      pathname: "results",
      rolloutRule: ENABLED,
      rolloutContext: CONTEXT,
      isAuthenticated: true,
    })).toThrow("V3 shell routing requires an absolute app pathname");
  });
});
