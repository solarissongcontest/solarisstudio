import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("App Experience v3 contextual entity ownership", () => {
  it("makes app tab selection use the full route location from one registry", () => {
    const tabs = source("src/components/app/AppTabBar.tsx");
    const shell = source("src/components/AppShell.tsx");
    const navigation = source("src/lib/app-navigation.ts");
    const registry = source("src/lib/app-screen-registry.ts");
    expect(tabs).toContain("resolveAppRouteChrome(pathname, searchStr)");
    expect(shell).toContain("searchStr={searchStr}");
    expect(navigation).toContain("resolveSolarisAppScreen(pathname, searchStr)");
    expect(registry).toContain('params.get("from") === "results"');
  });

  it("marks official-result Show links as Results-owned", () => {
    const results = source("src/routes/results/index.tsx");
    const scorecharts = source("src/routes/scorecharts/index.tsx");
    expect(results).toContain('search={{ from: "results" }}');
    expect(results).toContain("?from=results");
    expect(scorecharts).toContain('search={{ tab: "matrix", from: "results" }}');
  });

  it("preserves Results ownership while browsing sibling shows on iPad", () => {
    const show = source("src/routes/shows/$showId.tsx");
    expect(show).toContain('from?: "results"');
    expect(show).toContain('search.from === "results"');
    expect(show).toContain('?from=results');
  });
});
