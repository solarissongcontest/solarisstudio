import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Public V3 Scorecharts edition continuity", () => {
  it("keeps canonical Edition identity alongside grouped published matrices", () => {
    const screen = read("src/components/v3/V3ScorechartsScreen.tsx");

    expect(screen).toContain("editionSlug: string");
    expect(screen).toContain("editionSlug: item.editionSlug");
    expect(screen).toContain('to="/editions/$slug"');
    expect(screen).toContain("params={{ slug: group.editionSlug }}");
    expect(screen).toContain("Edition overview →");
    expect(screen).not.toContain("slugify(");
  });

  it("keeps the matrix destination publication-aware and context-labelled", () => {
    const screen = read("src/components/v3/V3ScorechartsScreen.tsx");

    expect(screen).toContain('to="/shows/$showId"');
    expect(screen).toContain('search={{ tab: "matrix", from: "results" }}');
    expect(screen).toContain("published voting matrix");
    expect(screen).not.toContain("jury_points");
    expect(screen).not.toContain("televote_points");
  });
});
