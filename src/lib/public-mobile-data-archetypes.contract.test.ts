import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("public mobile data archetypes", () => {
  const shell = source("src/components/AppShell.tsx");
  const archiveState = source("src/components/ArchiveDataState.tsx");
  const scorecharts = source("src/routes/scorecharts/index.tsx");
  const analysis = source("src/routes/analysis/index.tsx");
  const results = source("src/routes/results/index.tsx");
  const dataView = source("src/components/public/PublicDataView.tsx");

  it("drives shell width and data navigation from one route archetype registry", () => {
    expect(shell).toContain("publicRouteArchetype(pathname)");
    expect(shell).toContain("publicCanvasForArchetype(publicArchetype)");
    expect(shell).toContain('publicArchetype === "data-explorer"');
  });

  it("uses one shared public loading error and empty vocabulary", () => {
    expect(archiveState).toContain("PublicDataState");
    expect(results).toContain('kind="empty"');
    expect(scorecharts).toContain('kind="empty"');
    expect(analysis).toContain("PublicDataState");
  });

  it("collapses explanatory scorechart material on small screens", () => {
    expect(scorecharts).toContain("PublicDataGuide");
    expect(dataView).toContain("sm:hidden");
    expect(dataView).toContain("hidden rounded-2xl");
  });

  it("keeps analysis insights horizontally scannable on phones", () => {
    expect(analysis).toContain("PublicInsightRail");
    expect(analysis).toContain("PublicInsightCard");
    expect(dataView).toContain("snap-x");
    expect(dataView).toContain("overflow-x-auto");
  });
});
