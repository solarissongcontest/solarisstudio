import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const stage = readFileSync("src/components/ScoreboardStage.tsx", "utf8");
const card = readFileSync("src/components/broadcast/CountryCard.tsx", "utf8");
const editor = readFileSync("src/components/studio/ScoreboardZoneEditor.tsx", "utf8");

describe("shape-aware scoreboard flags", () => {
  it("lets square and circle geometry override the default rectangular flag ratio", () => {
    expect(stage).toContain('shapeKind === "circle" || shapeKind === "square"');
    expect(stage).toContain("const flagWidth = squareShape");
    expect(card).toContain('flagShape === "circle" || flagShape === "square"');
    expect(card).toContain("const sourceFlagWidth = squareFlagShape");
    expect(card).toContain('aspectRatio: isFlag ? `${sourceFlagWidth} / ${sourceFlagHeight}`');
  });

  it("uses the configured shape clipping instead of forcing a rounded rectangle", () => {
    expect(card).toContain("borderRadiusFor(zone.shape, 0)");
    expect(card).toContain("clipPathFor(zone.shape)");
    expect(stage).not.toContain('kind: flagRadius === 0 ? "rect" : "rounded"');
  });

  it("fills the selected shape without non-uniform stretching", () => {
    expect(stage).toContain('fit: "cover" as const');
    expect(card).toContain('objectFit: zone.fit === "contain" ? "contain" : "cover"');
    expect(card).not.toContain('objectFit: "fill"');
  });

  it("exposes square and circle choices in the friendly editor", () => {
    expect(editor).toContain('<option value="square">Square</option>');
    expect(editor).toContain('<option value="circle">Circle</option>');
    expect(editor).toContain('case "square"');
    expect(editor).toContain('case "circle"');
  });
});
