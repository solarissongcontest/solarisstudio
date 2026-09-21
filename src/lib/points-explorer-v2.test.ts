import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync("src/components/RadialPointsView.tsx", "utf8");

describe("Points Explorer V2", () => {
  it("uses scalable ranked contributor rows instead of a radial orbit", () => {
    expect(source).toContain("data-points-explorer-v2");
    expect(source).toContain("Where the points came from");
    expect(source).toContain("Show all");
    expect(source).toContain("ContributionRow");
    expect(source).not.toContain("ArrowRing");
    expect(source).not.toContain("aspect-square w-full max-w-[760px]");
  });

  it("keeps large voter sets readable by collapsing after ten contributors", () => {
    expect(source).toContain("const contributorLimit = 10");
    expect(source).toContain("showAllContributors");
    expect(source).toContain("juryContributors.slice(0, contributorLimit)");
  });

  it("fills explicit flag shapes without stretching", () => {
    expect(source).toContain('shape="circle"');
    expect(source).toContain('shape="rounded"');
    expect(source).toContain("object-cover");
    expect(source).toContain('data-points-flag-shape={shape}');
  });

  it("preserves drill-down between received and given points", () => {
    expect(source).toContain('setDirection("given")');
    expect(source).toContain('setDirection("received")');
    expect(source).toContain("findMatchingVoterOption");
  });
});
