import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync("src/components/RadialPointsView.tsx", "utf8");

describe("Points Explorer circle", () => {
  it("keeps the selected subject in the center with voters around a responsive circle", () => {
    expect(source).toContain("data-points-explorer-circle");
    expect(source).toContain("data-points-circle-stage");
    expect(source).toContain("ringRadius");
    expect(source).toContain("nodePercent");
    expect(source).toContain("CircleVoteNode");
    expect(source).toContain("ArrowRing");
    expect(source).not.toContain("ContributionRow");
  });

  it("represents the entire public vote as one TELE node", () => {
    expect(source).toContain('kind: "televote"');
    expect(source).toContain('code: "TELE"');
    expect(source).toContain("televoteCircleItem");
    expect(source).toContain("combined.unshift(televoteCircleItem)");
    expect(source).toContain("TELE is the aggregate public-vote total");
  });

  it("supports points received and points given drill-down", () => {
    expect(source).toContain('setDirection("given")');
    expect(source).toContain('setDirection("received")');
    expect(source).toContain("toggleCenterDirection");
    expect(source).toContain("findMatchingVoterOption");
  });

  it("fills circular flags instead of letterboxing a 3:2 rectangle inside them", () => {
    expect(source).toContain('className="absolute inset-0 h-full w-full object-cover"');
    expect(source).not.toContain('className="h-full w-full object-contain"');
  });

  it("shrinks nodes as voter count grows instead of overlapping fixed-size flags", () => {
    expect(source).toContain("255 / Math.max(circleCount, 1)");
    expect(source).toContain("circleCount > 32");
  });
});
