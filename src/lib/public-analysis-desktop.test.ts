import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("public Analysis desktop visualizations", () => {
  it("renders responsive Jury vs Televote SVG points with accessible hover and area-scaled radius", () => {
    const scatter = source("src/components/viz/JuryVsTelevote.tsx");
    const native = source("src/components/viz/NativeJuryTelevoteScatter.tsx");
    const geometry = source("src/lib/scatter-plot-geometry.ts");

    expect(scatter).toContain("NativeJuryTelevoteScatter");
    expect(scatter).not.toContain('from "recharts"');
    expect(native).toContain("ResizeObserver");
    expect(native).toContain("scatterPointRadius(point.n, lowCount, highCount)");
    expect(native).toContain("onFocus={() => onHover(point.id)}");
    expect(native).toContain('aria-label="Average jury points by average televote points.');
    expect(geometry).toContain("Math.sqrt((70 + ratio * 210) / Math.PI)");
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
