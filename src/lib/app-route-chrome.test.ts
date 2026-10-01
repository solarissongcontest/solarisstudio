import { describe, expect, it } from "vitest";

import { resolveAppRouteChrome } from "@/lib/app-route-chrome";

describe("installed app route chrome", () => {
  it("treats the five primary destinations as root screens", () => {
    expect(resolveAppRouteChrome("/").root).toBe(true);
    expect(resolveAppRouteChrome("/explore").root).toBe(true);
    expect(resolveAppRouteChrome("/participate").root).toBe(true);
    expect(resolveAppRouteChrome("/results").root).toBe(true);
    expect(resolveAppRouteChrome("/my-solaris").root).toBe(true);
  });

  it("classifies entities with a logical fallback while keeping their primary tab", () => {
    const chrome = resolveAppRouteChrome("/countries/OL");
    expect(chrome.archetype).toBe("entity");
    expect(chrome.tab).toBe("explore");
    expect(chrome.backFallback).toEqual({ label: "Countries", to: "/countries" });
  });

  it("makes official participation workflows focused tasks", () => {
    for (const path of ["/confirmations", "/jury-voting", "/televoting", "/next-in-line"]) {
      const chrome = resolveAppRouteChrome(path);
      expect(chrome.archetype).toBe("task");
      expect(chrome.tab).toBe("participate");
      expect(chrome.tabBar).toBe("hidden");
    }
  });

  it("keeps Show Mode distinct from an actual immersive broadcast", () => {
    expect(resolveAppRouteChrome("/show-mode").archetype).toBe("live");
    expect(resolveAppRouteChrome("/show-mode").tabBar).toBe("minimal");
    expect(resolveAppRouteChrome("/broadcast/test").archetype).toBe("immersive");
    expect(resolveAppRouteChrome("/broadcast/test").tabBar).toBe("hidden");
  });
  it("keeps task help and published results out of focused task mode", () => {
    const howTo = resolveAppRouteChrome("/televoting/how-to-vote");
    expect(howTo.archetype).toBe("reading");
    expect(howTo.tabBar).toBe("visible");
    expect(howTo.backFallback).toEqual({ label: "Televoting", to: "/televoting" });

    const published = resolveAppRouteChrome("/televoting/results");
    expect(published.archetype).toBe("data");
    expect(published.tab).toBe("results");
    expect(published.tabBar).toBe("visible");
  });

  it("gives focused participation tasks a toolbar help destination", () => {
    expect(resolveAppRouteChrome("/televoting").helpTo).toBe("/televoting/how-to-vote");
    expect(resolveAppRouteChrome("/confirmations").helpTo).toBe("/guide");
  });

  it("treats App Settings as a Me-area settings screen", () => {
    expect(resolveAppRouteChrome("/settings")).toMatchObject({
      title: "Settings",
      tab: "me",
      archetype: "settings",
      root: false,
      tabBar: "visible",
    });
  });

  it("keeps Show chrome in Results when the result context owns the entity", () => {
    expect(resolveAppRouteChrome("/shows/show-22", "?from=results")).toMatchObject({
      title: "Show",
      tab: "results",
      archetype: "entity",
      backFallback: { label: "Results", to: "/results" },
    });

    expect(resolveAppRouteChrome("/shows/show-22")).toMatchObject({
      tab: "explore",
      backFallback: { label: "Shows", to: "/shows" },
    });
  });

});
