import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const stage = readFileSync("src/components/ScoreboardStage.tsx", "utf8");
const card = readFileSync("src/components/broadcast/CountryCard.tsx", "utf8");
const editor = readFileSync("src/components/studio/ScoreboardZoneEditor.tsx", "utf8");
const flagMedia = readFileSync("src/components/FlagMedia.tsx", "utf8");

describe("shape-aware flag media", () => {
  it("keeps one crop system for standard factual flag media", () => {
    expect(flagMedia).toContain('mode?: "standard" | "original" | "atmosphere"');
    expect(flagMedia).toContain('objectFit: "cover"');
    expect(flagMedia).toContain("objectPosition:");
    expect(flagMedia).toContain("selected.zoom");
  });

  it("lets square and circle scoreboard geometry override the default 3:2 frame", () => {
    expect(stage).toContain('shapeKind === "circle" || shapeKind === "square"');
    expect(card).toContain('kind === "circle" || kind === "square"');
    expect(card).toContain('aspectRatio: "1 / 1"');
    expect(card).not.toContain('aspectRatio: isFlag ? "3 / 2"');
  });

  it("preserves configured clipping and never uses non-uniform stretching", () => {
    expect(card).toContain("borderRadiusFor(zone.shape, 0)");
    expect(card).toContain("clipPathFor(zone.shape)");
    expect(stage).toContain('fit: "cover" as const');
    expect(card).not.toContain('objectFit: "fill"');
  });

  it("exposes square, circle and crop-focus controls in the editor", () => {
    expect(editor).toContain('<option value="square">Square</option>');
    expect(editor).toContain('<option value="circle">Circle</option>');
    expect(editor).toContain("Crop focus");
    expect(editor).not.toContain(">Stretch<");
  });
});
