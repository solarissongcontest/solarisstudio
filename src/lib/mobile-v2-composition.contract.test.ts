import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Mobile App V2 composition completion", () => {
  it("uses the shared mobile composition primitives across primary directories", () => {
    const primitives = source("src/components/app/AppPrimitives.tsx");
    for (const primitive of [
      "AppScreen",
      "AppSectionHeader",
      "AppGroupedList",
      "AppCard",
      "AppEmptyState",
      "AppStatusBadge",
    ]) {
      expect(primitives).toContain(`export function ${primitive}`);
    }

    for (const route of [
      "src/routes/countries/index.tsx",
      "src/routes/editions/index.tsx",
      "src/routes/shows/index.tsx",
      "src/routes/results/index.tsx",
      "src/routes/site-directory/index.tsx",
    ]) {
      const code = source(route);
      expect(code, route).toContain("AppScreen");
      expect(code, route).toContain("AppSectionHeader");
      expect(code, route).toContain("AppGroupedList");
    }
  });

  it("keeps app card surfaces flat and tokenized instead of multiplying glass panels", () => {
    const css = source("src/styles/app-shell.css");
    const primitives = source("src/components/app/AppPrimitives.tsx");
    const results = source("src/routes/results/index.tsx");
    const editions = source("src/routes/editions/index.tsx");
    const contest = source("src/components/home/CurrentContestHero.tsx");

    expect(primitives).toContain('"solaris-app-card"');
    expect(css).toContain("html[data-solaris-app] .solaris-app-card");
    expect(css).toContain("box-shadow: none");
    expect(results).toContain('<AppCard tone="accent"');
    expect(editions).toContain("solaris-app-card solaris-app-edition-current");
    expect(contest).toContain("solaris-app-card solaris-app-current-contest");
  });

  it("gives installed directory empty states a recovery action", () => {
    for (const route of [
      "src/routes/countries/index.tsx",
      "src/routes/editions/index.tsx",
      "src/routes/shows/index.tsx",
      "src/routes/site-directory/index.tsx",
    ]) {
      const code = source(route);
      expect(code, route).toContain("AppEmptyState");
      expect(code, route).toContain("solaris-app-empty-action");
    }
  });

  it("progressively discloses heavy data and lazy-loads expensive visualizations", () => {
    const analysis = source("src/routes/analysis/index.tsx");
    const resultLab = source("src/routes/result-lab/index.tsx");
    const scorecharts = source("src/routes/scorecharts/index.tsx");

    expect(analysis).toContain("ResponsiveTabs");
    expect(analysis).toContain("DeferredVisualization");
    expect(analysis).toContain('lazy(() =>\n  import("@/components/viz/');
    expect(analysis).toContain('tab === "connections"');
    expect(analysis).toContain('tab === "history"');

    expect(resultLab).toContain("DataStoryPage");
    expect(resultLab).toContain("ResponsiveHistory");
    expect(resultLab).toContain("xl:grid-cols-[360px_minmax(0,1fr)]");

    expect(scorecharts).toContain('search={{ tab: "matrix", from: "results" }}');
    expect(scorecharts).not.toContain("<table");
  });

  it("keeps heavyweight secondary surfaces split behind dynamic imports", () => {
    const shell = source("src/components/AppShell.tsx");
    const country = source("src/routes/countries/$code.tsx");
    const analysis = source("src/routes/analysis/index.tsx");
    const pkg = source("package.json");

    expect(shell).toContain("LazyHomeAnniversaryTakeover");
    expect(shell).toContain("LazyEditionHostingExtension");
    expect(country).toContain("const CountryPlacementChart = lazy");
    expect(analysis).toContain("const NetworkGraph = lazy");
    expect(analysis).toContain("const HistoricalLeaderboard = lazy");
    expect(pkg).toContain('"budget:client"');
  });
});
