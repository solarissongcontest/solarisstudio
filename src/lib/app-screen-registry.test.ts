import { describe, expect, it } from "vitest";

import { resolveSolarisAppScreen } from "@/lib/app-screen-registry";

describe("Solaris app screen registry", () => {
  it("owns all five root tabs deterministically", () => {
    expect(resolveSolarisAppScreen("/").hierarchy.rootTab).toBe("home");
    expect(resolveSolarisAppScreen("/explore").hierarchy.rootTab).toBe("explore");
    expect(resolveSolarisAppScreen("/participate").hierarchy.rootTab).toBe("participate");
    expect(resolveSolarisAppScreen("/results").hierarchy.rootTab).toBe("results");
    expect(resolveSolarisAppScreen("/my-solaris").hierarchy.rootTab).toBe("me");
  });

  it("keeps focused participation tasks out of global tab navigation", () => {
    for (const path of ["/confirmations", "/jury-voting", "/televoting", "/next-in-line", "/integrity/report"]) {
      const screen = resolveSolarisAppScreen(path);
      expect(screen.presentation).toBe("task");
      expect(screen.chrome.tabbar).toBe("hidden");
      expect(screen.chrome.search).toBe("none");
      expect(screen.behavior.criticalTask).toBe(true);
      expect(screen.behavior.offline).toBe("online-required");
    }
  });

  it("keeps rule reading discoverable and offline-ready", () => {
    const screen = resolveSolarisAppScreen("/rules");
    expect(screen.hierarchy.rootTab).toBe("explore");
    expect(screen.presentation).toBe("article");
    expect(screen.chrome.search).toBe("local");
    expect(screen.behavior.offline).toBe("ready");
  });

  it("lets result-owned show entities stay in Results", () => {
    const screen = resolveSolarisAppScreen("/shows/show-22", "?from=results");
    expect(screen.hierarchy.rootTab).toBe("results");
    expect(screen.hierarchy.parent).toEqual({ label: "Results", href: "/results" });
  });

  it("marks Show Mode as minimal immersive chrome without making it a critical task", () => {
    const screen = resolveSolarisAppScreen("/show-mode");
    expect(screen.presentation).toBe("live");
    expect(screen.chrome.tabbar).toBe("minimal");
    expect(screen.behavior.immersive).toBe(true);
    expect(screen.behavior.criticalTask).toBe(false);
  });

  it("never falls back to remembered navigation identity", () => {
    const screen = resolveSolarisAppScreen("/an-unknown-public-route");
    expect(screen.hierarchy.rootTab).toBe("home");
    expect(screen.id).toBe("fallback");
  });
});
