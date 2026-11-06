import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("Public Scorecharts historical edition disclosure", () => {
  it("starts with a bounded archive view without truncating the published source", () => {
    const screen = read("src/components/v3/V3ScorechartsScreen.tsx");
    const source = read("src/integrations/v3/scorecharts-source.server.ts");

    expect(screen).toContain("useState(4)");
    expect(screen).toContain("orderedGroups.slice(0, visibleEditionCount)");
    expect(screen).toContain("orderedGroups.length - visibleEditionCount");
    expect(screen).toContain('meta={`${items.length} ${items.length === 1 ? "scorechart" : "scorecharts"}`}');
    expect(source).toContain("const scorechartShows =");
    expect(source).toContain("const items = scorechartShows.flatMap");
    expect(source).not.toContain(".limit(4)");
    expect(source).not.toContain(".slice(0, 4)");
  });

  it("progressively reveals additional complete editions on a keyboard-accessible button", () => {
    const screen = read("src/components/v3/V3ScorechartsScreen.tsx");

    expect(screen).toContain("setVisibleEditionCount((count) => count + 4)");
    expect(screen).toContain("remainingEditionCount > 0");
    expect(screen).toContain('type="button"');
    expect(screen).toContain('aria-label={`Show older published scorecharts,');
    expect(screen).toContain("Show older editions (");
    expect(screen).toContain("min-h-11");
    expect(screen).toContain("focus-visible:ring-2");
  });

  it("preserves all published show deep links, grouped context and the empty state", () => {
    const screen = read("src/components/v3/V3ScorechartsScreen.tsx");

    expect(screen).toContain("groups.set(item.editionId");
    expect(screen).toContain("group.items.map((item)");
    expect(screen).toContain('to="/shows/$showId"');
    expect(screen).toContain('search={{ tab: "matrix", from: "results" }}');
    expect(screen).toContain('data-v3-scorecharts-empty=""');
    expect(screen).toContain("No published scorecharts yet");
    expect(screen).not.toContain(".from(\"results\")");
  });
});
