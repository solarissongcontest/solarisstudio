import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const root = source("src/routes/__root.tsx");
const bridge = source("src/components/v3/V3RootLegacyCutover.tsx");
const lazyShell = source("src/components/v3/V3LegacyRouteShell.tsx");
const capabilityRegistry = source("src/lib/v3-capability-registry.ts");
const legacyResultsRedirect = source("src/routes/results/$slug.tsx");

describe("Public V3 deep-route shell cutover", () => {
  it("mounts one centralized bridge inside the canonical query provider", () => {
    expect(root).toContain('import { V3RootLegacyCutover } from "../components/v3/V3RootLegacyCutover"');
    expect(root).toContain("<QueryClientProvider client={queryClient}>");
    expect(root).toContain("<V3RootLegacyCutover>{content}</V3RootLegacyCutover>");
  });

  it("reuses the canonical server rollout and route safety boundary", () => {
    expect(bridge).toContain("useV3RolloutProbe(Boolean(target) && platformResolved && isAppMode)");
    expect(bridge).toContain("decideV3ShellForRoute({");
    expect(bridge).toContain('rolloutRule: { stage: "enabled" }');
    expect(bridge).toContain("useHydrationSafeRouterLocation()");
    expect(bridge).not.toContain("localStorage");
    expect(bridge).not.toContain("sessionStorage");
  });

  it("keeps native V3 roots/details out of the legacy bridge", () => {
    expect(bridge).toContain('pathname === "/countries"');
    expect(bridge).toContain('pathname === "/editions"');
    expect(bridge).toContain('pathname.startsWith("/results/")');
    expect(bridge).not.toContain('routeMatchesPrefix(pathname, "/countries")');
    expect(bridge).not.toContain('routeMatchesPrefix(pathname, "/editions")');
    expect(bridge).not.toContain('pathname === "/results"');
  });

  it("covers the remaining legacy public route families from one runtime module", () => {
    for (const route of [
      "/shows",
      "/wiki",
      "/encyclopedia",
      "/pulse",
      "/analysis",
      "/compare",
      "/voting-dna",
      "/tools",
      "/guide",
    ]) {
      expect(bridge).toContain(`routeMatchesPrefix(pathname, "${route}")`);
    }
    expect(bridge).toContain('params.get("from") === "results" ? "Results" : "Shows"');
  });

  it("keeps Explore, Results and Me cutovers independently reversible", () => {
    expect(bridge).toContain('shell.rootTab === "explore" && rollout.data.exploreEnabled !== true');
    expect(bridge).toContain('shell.rootTab === "results" && rollout.data.resultsEnabled !== true');
    expect(bridge).toContain('shell.rootTab === "me" && rollout.data.meEnabled !== true');
  });

  it("keeps the heavy V3 chrome lazy and the child route as data authority", () => {
    expect(bridge).toContain("lazy(() =>");
    expect(bridge).toContain('import("./V3LegacyRouteShell")');
    expect(bridge).not.toContain('from "./V3AppShell"');
    expect(lazyShell).toContain('from "./V3AppShell"');
    expect(lazyShell).toContain("{children}");
    expect(lazyShell).toContain('data-v3-legacy-route-adapter=""');
    expect(`${bridge}\n${lazyShell}`).not.toContain("supabase");
    expect(`${bridge}\n${lazyShell}`).not.toContain("useQuery(");
    expect(`${bridge}\n${lazyShell}`).not.toContain("fetch(");
  });

  it("does not create synthetic TanStack parent routes just to change chrome", () => {
    for (const path of [
      "src/routes/analysis/route.tsx",
      "src/routes/compare/route.tsx",
      "src/routes/countries/route.tsx",
      "src/routes/editions/route.tsx",
      "src/routes/encyclopedia/route.tsx",
      "src/routes/guide/route.tsx",
      "src/routes/pulse/route.tsx",
      "src/routes/results/route.tsx",
      "src/routes/shows/route.tsx",
      "src/routes/tools/route.tsx",
      "src/routes/voting-dna/route.tsx",
      "src/routes/wiki/route.tsx",
    ]) {
      expect(existsSync(resolve(process.cwd(), path))).toBe(false);
    }
    expect(capabilityRegistry).not.toContain("V3_PUBLIC_SHELL_CUTOVER_CAPABILITIES");
  });

  it("preserves Results-origin context for the legacy results redirect", () => {
    expect(legacyResultsRedirect).toContain('search: { from: "results" }');
  });
});
