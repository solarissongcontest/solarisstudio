import { describe, expect, it } from "vitest";

import {
  resolveV3FocusedTaskChrome,
  v3FocusedParticipationRouteEnabled,
} from "./v3-focused-task-chrome";

describe("Solaris Studio V3 focused critical-task chrome", () => {
  it.each([
    ["/confirmations", "Confirmations", "/guide"],
    ["/jury-voting", "Jury voting", "/guide"],
    ["/televoting", "Televoting", "/televoting/how-to-vote"],
    ["/next-in-line", "Next in Line", "/guide"],
    ["/my-solaris/entry", "Entry", "/guide"],
  ] as const)("reuses canonical task chrome for %s", (pathname, title, helpTo) => {
    const chrome = resolveV3FocusedTaskChrome(pathname);

    expect(chrome.pathname).toBe(pathname);
    expect(chrome.title).toBe(title);
    expect(chrome.rootTab).toBe("participate");
    expect(chrome.backLabel).toBe("Participate");
    expect(chrome.backTo).toBe("/participate");
    expect(chrome.helpTo).toBe(helpTo);
  });

  it("keeps one fail-closed rollout authority for focused participation chrome", () => {
    const globalOnly = { enabled: true, confirmationEnabled: false, juryEnabled: false };
    const allEnabled = { enabled: true, confirmationEnabled: true, juryEnabled: true };

    expect(v3FocusedParticipationRouteEnabled("/confirmations", globalOnly)).toBe(false);
    expect(v3FocusedParticipationRouteEnabled("/jury-voting", globalOnly)).toBe(false);
    expect(v3FocusedParticipationRouteEnabled("/televoting", globalOnly)).toBe(true);
    expect(v3FocusedParticipationRouteEnabled("/next-in-line", globalOnly)).toBe(true);
    expect(v3FocusedParticipationRouteEnabled("/confirmations/edit/token", allEnabled)).toBe(true);
    expect(v3FocusedParticipationRouteEnabled("/jury-voting", allEnabled)).toBe(true);

    expect(v3FocusedParticipationRouteEnabled("/televoting", undefined)).toBe(false);
    expect(v3FocusedParticipationRouteEnabled("/televoting", { enabled: false })).toBe(false);
    expect(v3FocusedParticipationRouteEnabled("/participate", allEnabled)).toBe(false);
    expect(v3FocusedParticipationRouteEnabled("/my-solaris/entry", allEnabled)).toBe(false);
  });

  it("preserves task route ownership and does not rewrite the path", () => {
    const chrome = resolveV3FocusedTaskChrome("/jury-voting");
    expect(chrome.pathname).toBe("/jury-voting");
    expect(chrome.screenId).toBe("participation.task");
  });

  it("keeps Entry on its own authenticated screen identity", () => {
    const chrome = resolveV3FocusedTaskChrome("/my-solaris/entry");
    expect(chrome.pathname).toBe("/my-solaris/entry");
    expect(chrome.screenId).toBe("mysolaris.entry");
    expect(chrome.rootTab).toBe("participate");
  });

  it.each(["/", "/results", "/countries/oland", "/my-solaris"])(
    "rejects ordinary full-tab route %s",
    (pathname) => {
      expect(() => resolveV3FocusedTaskChrome(pathname)).toThrow(
        /not classified as a critical participant task/,
      );
    },
  );

  it("rejects immersive experiences instead of forcing focused task chrome onto them", () => {
    // The app-screen registry owns the exact immersive classification. This
    // resolver's invariant is simply that such a route can never produce a
    // focused critical-task shell, even if the registry later renames it.
    expect(() => resolveV3FocusedTaskChrome("/show-mode")).toThrow();
  });

  it("rejects unknown routes rather than trusting registry fallback chrome", () => {
    expect(() => resolveV3FocusedTaskChrome("/not-a-real-solaris-task")).toThrow(
      "unknown route cannot enter the V3 focused task shell",
    );
  });

  it("rejects non-absolute input rather than guessing navigation scope", () => {
    expect(() => resolveV3FocusedTaskChrome("jury-voting")).toThrow(
      "pathname must be an internal absolute Solaris route",
    );
  });
});
