import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NativeJuryTelevoteScatter } from "./NativeJuryTelevoteScatter";

const DATA = [
  { id: "a", name: "Aotea", code: "AOT", color: "#123456", jury: 7.5, televote: 3.5, n: 4 },
  { id: "b", name: "Oland", code: "OLA", color: "#654321", jury: 2, televote: 9, n: 8 },
];

describe("native Jury vs Televote visualization", () => {
  it("renders labeled axes and a keyboard-focusable accessible point for each country", () => {
    const html = renderToStaticMarkup(
      <NativeJuryTelevoteScatter data={DATA} hoverId={null} onHover={() => {}} />,
    );
    expect(html).toContain("Average jury points");
    expect(html).toContain("Average televote points");
    expect(html.match(/<circle /g)).toHaveLength(2);
    expect(html.match(/role="button"/g)).toHaveLength(2);
    expect(html.match(/tabindex="0"/g)).toHaveLength(2);
    expect(html).toContain("Aotea: jury 7.5, televote 3.5, 4 appearances");
    expect(html).toContain("Oland: jury 2.0, televote 9.0, 8 appearances");
  });

  it("renders a readable tooltip for the active country without hiding the points", () => {
    const html = renderToStaticMarkup(
      <NativeJuryTelevoteScatter data={DATA} hoverId="b" onHover={() => {}} />,
    );
    expect(html).toContain("Avg televote: 9.0");
    expect(html).toContain("8 appearances");
    expect(html).toContain('aria-hidden="true"');
    expect(html.match(/<circle /g)).toHaveLength(2);
  });
});
