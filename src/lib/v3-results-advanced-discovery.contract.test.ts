import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../integrations/v3/results-source.server.ts", import.meta.url),
  "utf8",
);
const projection = readFileSync(new URL("./v3-results.ts", import.meta.url), "utf8");
const screen = readFileSync(
  new URL("../components/v3/V3ResultsScreen.tsx", import.meta.url),
  "utf8",
);

describe("V3 Results advanced-tool discovery", () => {
  it("keeps every retained Chat 2A Results tool discoverable from the Results projection", () => {
    expect(source).toContain('href: "/scorecharts"');
    expect(source).toContain('href: "/records"');
    expect(source).toContain('href: "/relationships"');
    expect(source).toContain('href: "/result-lab"');
    expect(source).toContain('href: "/broadcast-intelligence"');
    expect(source).toContain('label: "Broadcast Intelligence"');
  });

  it("keeps advanced tools as links instead of eagerly loading their datasets on the Results root", () => {
    expect(projection).toContain("moreAnalysis: [...input.advancedTools]");
    expect(screen).toContain("projection.moreAnalysis");
    expect(source).not.toContain("broadcast-intelligence-source.server");
    expect(source).not.toContain("result-lab-source.server");
    expect(source).not.toContain("relationships-source.server");
  });
});
