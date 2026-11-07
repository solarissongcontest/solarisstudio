import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NativeLineChart } from "./NativeLineChart";

describe("native published-history line charts", () => {
  it("server-renders two labeled monotone curves with accessible keyboard targets", () => {
    const markup = renderToStaticMarkup(
      <NativeLineChart
        data={[
          { edition: "SSC 1", a: 1, b: 5 },
          { edition: "SSC 2", a: 3, b: 4 },
          { edition: "SSC 3", a: 2, b: 6 },
        ]}
        xKey="edition"
        reversed
        yDomain={[1, 10]}
        yTickFormatter={(value) => "#" + Math.round(value)}
        series={[
          { key: "a", name: "Aotea", stroke: "#237a8b", strokeWidth: 3 },
          { key: "b", name: "Oland", stroke: "#c49523", strokeWidth: 3 },
        ]}
      />,
    );
    expect(markup).toContain("SSC 1");
    expect(markup).toContain("SSC 3");
    expect(markup).toContain("#1");
    expect(markup).toContain("Aotea 1, Oland 5");
    expect(markup).toContain("Oland 5");
    expect(markup.match(/role="button"/g)).toHaveLength(3);
    expect(markup.match(/<path /g)).toHaveLength(2);
    expect(markup).toContain(" C ");
    expect(markup).not.toContain("NaN");
  });

  it("keeps missing edition placements as gaps unless connectNulls is enabled", () => {
    const data = [
      { edition: "SSC 1", position: 1 },
      { edition: "SSC 2", position: null },
      { edition: "SSC 3", position: 3 },
    ];
    const separated = renderToStaticMarkup(
      <NativeLineChart data={data} xKey="edition" series={[{
        key: "position", name: "Placement", stroke: "#ffffff", connectNulls: false,
      }]} />,
    );
    const connected = renderToStaticMarkup(
      <NativeLineChart data={data} xKey="edition" series={[{
        key: "position", name: "Placement", stroke: "#ffffff", connectNulls: true,
      }]} />,
    );
    expect(separated.match(/<path /g)).toHaveLength(2);
    expect(connected.match(/<path /g)).toHaveLength(1);
    expect(connected).toContain(" C ");
  });
});
