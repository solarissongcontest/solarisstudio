import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("public Analysis desktop visualizations", () => {
  it("renders Jury vs Televote scatter points with a real radius", () => {
    const scatter = source("src/components/viz/JuryVsTelevote.tsx");

    expect(scatter).toContain("Number(props.size)");
    expect(scatter).toContain("Math.sqrt(size / Math.PI)");
    expect(scatter).not.toContain("props.r + 3");
    expect(scatter).toContain('ResponsiveContainer width="100%" height="100%" minWidth={0}');
  });

  it("lets desktop network and chord diagrams use the available panel width", () => {
    const network = source("src/components/viz/NetworkGraph.tsx");
    const chord = source("src/components/viz/ChordDiagram.tsx");

    for (const visual of [network, chord]) {
      expect(visual).toContain("viewBox={`0 0 ${size} ${size}`}");
      expect(visual).toContain('className="mx-auto block aspect-square w-full max-w-[720px]"');
      expect(visual).not.toContain("width={size}\n");
    }
  });

  it("gives the historical chart a larger desktop plotting area", () => {
    const history = source("src/components/viz/HistoricalLeaderboard.tsx");

    expect(history).toContain("md:h-[460px]");
    expect(history).toContain("xl:h-[520px]");
    expect(history).toContain('ResponsiveContainer width="100%" height="100%" minWidth={0}');
  });
});
