import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("public mobile chart fallbacks", () => {
  const juryTele = source("src/components/viz/JuryVsTelevote.tsx");
  const history = source("src/components/viz/HistoricalLeaderboard.tsx");
  const chord = source("src/components/viz/ChordDiagram.tsx");
  const matrix = source("src/components/VotingMatrix.tsx");

  it("puts a readable jury/televote summary before the scatter plot on phones", () => {
    expect(juryTele).toContain("Biggest jury–televote gaps");
    expect(juryTele).toContain("Open scatter plot");
    expect(juryTele).toContain("sm:hidden");
    expect(juryTele).toContain("hidden sm:block");
  });

  it("puts placement history in a mobile list before the line chart", () => {
    expect(history).toContain("mobileSummary");
    expect(history).toContain("Open placement chart");
    expect(history).toContain("hidden sm:block");
  });

  it("summarizes relationship chords before the diagram on phones", () => {
    expect(chord).toContain("Strongest two-way connections");
    expect(chord).toContain("Open chord diagram");
  });

  it("makes detailed voting readable without opening the full matrix", () => {
    expect(matrix).toContain("Jury ranking");
    expect(matrix).toContain("Open full voting matrix");
    expect(matrix).toContain("hidden overflow-auto sm:block");
  });
});
