import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const stage = readFileSync("src/components/ScoreboardStage.tsx", "utf8");
const card = readFileSync("src/components/broadcast/CountryCard.tsx", "utf8");
const editor = readFileSync("src/components/studio/ScoreboardZoneEditor.tsx", "utf8");

describe("shape-aware scoreboard flags", () => {
  it("lets square and circle geometry override the default 3:2 rectangle", () => {
    expect(stage).toContain('shapeKind === "circle" || shapeKind === "square"');
    expect(stage).toContain("const flagWidth = squareShape");
    expect(card).toContain('kind === "circle" || kind === "square"');
    expect(card).toContain('aspectRatio: "1 / 1"');
    expect(card).toContain('requestedWidth == null && requestedHeight == null');
  });

  it("uses configured clipping and radius all the way to the image", () => {
    expect(card).toContain("borderRadiusFor(zone.shape, 0)");
    expect(card).toContain("clipPathFor(zone.shape)");
    expect(card).toContain('objectFit: "cover"');
    expect(card).not.toContain('aspectRatio: isFlag ? "3 / 2"');
  });

  it("never non-uniformly stretches a flag to fill a shape", () => {
    expect(stage).toContain('fit: "cover" as const');
    expect(card).not.toContain('objectFit: "fill"');
    expect(editor).toContain("Flags always fill the selected shape with a uniform crop");
    expect(editor).not.toContain(">Stretch<");
  });

  it("exposes square, circle and crop focus in the friendly editor", () => {
    expect(editor).toContain('<option value="square">Square</option>');
    expect(editor).toContain('<option value="circle">Circle</option>');
    expect(editor).toContain('case "square"');
    expect(editor).toContain('case "circle"');
    expect(editor).toContain("Crop focus");
  });
});
