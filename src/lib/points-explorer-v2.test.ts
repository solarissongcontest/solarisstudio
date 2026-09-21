import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync("src/components/RadialPointsView.tsx", "utf8");

describe("Points Explorer circular contract", () => {
  it("keeps a true radial received/given interaction", () => {
    expect(source).toContain("data-points-explorer-circle");
    expect(source).toContain("data-points-circle-stage");
    expect(source).toContain("ringRadius");
    expect(source).toContain("nodePercent");
    expect(source).toContain("toggleCenterDirection");
    expect(source).toContain('setDirection("given")');
    expect(source).toContain('setDirection("received")');
  });

  it("represents public voting as one aggregate TELE node", () => {
    expect(source).toContain('kind: "televote"');
    expect(source).toContain('code: "TELE"');
    expect(source).toContain("televoteCircleItem");
    expect(source).toContain("combined.unshift(televoteCircleItem)");
    expect(source).toContain("TELE is the aggregate public-vote total");
  });

  it("fills circular flag nodes rather than letterboxing them", () => {
    expect(source).toContain('className="absolute inset-0 h-full w-full object-cover"');
    expect(source).not.toContain('className="h-full w-full object-contain"');
  });

  it("adapts node and centre size for dense voting fields", () => {
    expect(source).toContain("255 / Math.max(circleCount, 1)");
    expect(source).toContain("circleCount > 32");
    expect(source).toContain("circleCount <= 36");
  });
});
