import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const adapter = source("src/components/v3/V3LegacyRouteAdapter.tsx");
const countries = source("src/routes/countries/route.tsx");
const editions = source("src/routes/editions/route.tsx");
const shows = source("src/routes/shows/route.tsx");
const wiki = source("src/routes/wiki/route.tsx");
const encyclopedia = source("src/routes/encyclopedia/route.tsx");

describe("Public V3 deep-route shell cutover", () => {
  it("reuses the canonical server rollout and route safety boundary", () => {
    expect(adapter).toContain("useV3RolloutProbe(platformResolved && isAppMode)");
    expect(adapter).toContain("decideV3ShellForRoute({");
    expect(adapter).toContain('rolloutRule: { stage: "enabled" }');
    expect(adapter).toContain("if (!platformResolved || !isAppMode)");
    expect(adapter).not.toContain("localStorage");
    expect(adapter).not.toContain("sessionStorage");
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

  it("keeps secondary Explore reference surfaces in the same V3 shell", () => {
    expect(wiki).toContain('createFileRoute("/wiki")');
    expect(wiki).toContain('phaseLabel="Wiki"');
    expect(encyclopedia).toContain('createFileRoute("/encyclopedia")');
    expect(encyclopedia).toContain('phaseLabel="Encyclopedia"');
  });
});
