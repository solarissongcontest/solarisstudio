import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const adapter = source("src/components/v3/V3LegacyRouteAdapter.tsx");
const countries = source("src/routes/countries/route.tsx");
const editions = source("src/routes/editions/route.tsx");
const shows = source("src/routes/shows/route.tsx");
const results = source("src/routes/results/route.tsx");
const legacyResultsRedirect = source("src/routes/results/$slug.tsx");
const wiki = source("src/routes/wiki/route.tsx");
const encyclopedia = source("src/routes/encyclopedia/route.tsx");
const pulse = source("src/routes/pulse/route.tsx");
const analysis = source("src/routes/analysis/route.tsx");
const compare = source("src/routes/compare/route.tsx");
const votingDna = source("src/routes/voting-dna/route.tsx");
const tools = source("src/routes/tools/route.tsx");
const guide = source("src/routes/guide/route.tsx");
const cutoverCapabilities = source("src/lib/v3-public-shell-cutover-capabilities.ts");

describe("Public V3 deep-route shell cutover", () => {
  it("reuses the canonical server rollout and route safety boundary", () => {
    expect(adapter).toContain("useV3RolloutProbe(platformResolved && isAppMode)");
    expect(adapter).toContain("decideV3ShellForRoute({");
    expect(adapter).toContain('rolloutRule: { stage: "enabled" }');
    expect(adapter).toContain("if (!platformResolved || !isAppMode)");
    expect(adapter).not.toContain("localStorage");
    expect(adapter).not.toContain("sessionStorage");
  });

  it("keeps independently reversible Explore, Results and Me cutovers fail-closed", () => {
    expect(adapter).toContain('shell.rootTab === "explore" && rollout.data.exploreEnabled !== true');
    expect(adapter).toContain('shell.rootTab === "results" && rollout.data.resultsEnabled !== true');
    expect(adapter).toContain('shell.rootTab === "me" && rollout.data.meEnabled !== true');
  });

  it("adapts chrome only and does not create another public data authority", () => {
    expect(adapter).toContain("{children}");
    expect(adapter).toContain('data-v3-legacy-route-adapter=""');
    expect(adapter).toContain(".solaris-app-toolbar");
    expect(adapter).toContain(".solaris-app-tabbar");
    expect(adapter).toContain(".app-main");
    expect(adapter).not.toContain("supabase");
    expect(adapter).not.toContain("useQuery(");
    expect(adapter).not.toContain("fetch(");
  });

  it("cuts over directory roots without nesting existing V3 detail gates", () => {
    expect(countries).toContain('createFileRoute("/countries")');
    expect(countries).toContain('pathname === "/countries"');
    expect(countries).toContain("if (!directoryRoot) return <Outlet />");
    expect(countries).toContain('phaseLabel="Countries"');

    expect(editions).toContain('createFileRoute("/editions")');
    expect(editions).toContain('pathname === "/editions"');
    expect(editions).toContain("if (!directoryRoot) return <Outlet />");
    expect(editions).toContain('phaseLabel="Editions"');
  });

  it("keeps Show details in V3 shell and preserves Results-origin context", () => {
    expect(shows).toContain('createFileRoute("/shows")');
    expect(shows).toContain('search.get("from") === "results"');
    expect(shows).toContain('phaseLabel={fromResults ? "Results" : "Shows"}');
    expect(shows).toContain("<Outlet />");
  });

  it("keeps legacy Results descendants inside Results without nesting the native root", () => {
    expect(results).toContain('createFileRoute("/results")');
    expect(results).toContain('pathname === "/results"');
    expect(results).toContain("if (resultsRoot) return <Outlet />");
    expect(results).toContain('phaseLabel="Results"');
    expect(legacyResultsRedirect).toContain('search: { from: "results" }');
  });

  it("keeps secondary public discovery surfaces in the same V3 shell", () => {
    expect(wiki).toContain('createFileRoute("/wiki")');
    expect(wiki).toContain('phaseLabel="Wiki"');
    expect(encyclopedia).toContain('createFileRoute("/encyclopedia")');
    expect(encyclopedia).toContain('phaseLabel="Encyclopedia"');
    expect(pulse).toContain('createFileRoute("/pulse")');
    expect(pulse).toContain('phaseLabel="Pulse"');
    expect(tools).toContain('createFileRoute("/tools")');
    expect(tools).toContain('phaseLabel="Tools"');
    expect(guide).toContain('createFileRoute("/guide")');
    expect(guide).toContain('phaseLabel="Guide"');
  });

  it("keeps result-analysis roots on canonical Results ownership", () => {
    expect(analysis).toContain('createFileRoute("/analysis")');
    expect(analysis).toContain('phaseLabel="Analysis"');
    expect(compare).toContain('createFileRoute("/compare")');
    expect(compare).toContain('phaseLabel="Compare"');
    expect(votingDna).toContain('createFileRoute("/voting-dna")');
    expect(votingDna).toContain('phaseLabel="Voting DNA"');
  });

  it("classifies every new parent route before the registry guard sees it", () => {
    expect(cutoverCapabilities).toContain('id: "explore-directory-roots"');
    for (const route of ["/countries", "/editions", "/shows", "/wiki", "/tools", "/guide"]) {
      expect(cutoverCapabilities).toContain(`"${route}"`);
    }
    expect(cutoverCapabilities).toContain('id: "results-analysis-roots"');
    for (const route of ["/analysis", "/compare", "/voting-dna"]) {
      expect(cutoverCapabilities).toContain(`"${route}"`);
    }
    expect(cutoverCapabilities).toContain('classification: "merge"');
    expect(cutoverCapabilities).toContain('targetRoute: "/explore"');
    expect(cutoverCapabilities).toContain('targetRoute: "/results"');
  });
});
