import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("V3 client budget confetti replacement", () => {
  const vite = source("vite.config.ts");
  const helper = source("src/lib/lightweight-confetti.ts");
  const broadcast = source("src/routes/broadcast/$showId.tsx");

  it("aliases only the existing canvas-confetti module boundary", () => {
    expect(vite).toContain('"canvas-confetti": fileURLToPath(');
    expect(vite).toContain('new URL("./src/lib/lightweight-confetti.ts", import.meta.url)');
    expect(broadcast).toContain('import confetti from "canvas-confetti"');
  });

  it("preserves the broadcast winner burst call contract", () => {
    expect(broadcast).toContain("confetti({");
    expect(broadcast).toContain("particleCount: 180");
    expect(broadcast).toContain("spread: 100");
    expect(broadcast).toContain("y: 0.6");
    expect(helper).toContain("options.particleCount ?? 120");
    expect(helper).toContain("options.spread ?? 70");
    expect(helper).toContain("options.origin?.y ?? 0.5");
  });

  it("keeps the visual effect bounded, non-interactive and motion-safe", () => {
    expect(helper).toContain('matchMedia("(prefers-reduced-motion: reduce)")');
    expect(helper).toContain('canvas.setAttribute("aria-hidden", "true")');
    expect(helper).toContain('pointerEvents: "none"');
    expect(helper).toContain("Math.min(240");
    expect(helper).toContain("const DURATION_MS = 1_800");
    expect(helper).toContain("canvas.remove()");
  });

  it("does not claim to implement unused canvas-confetti APIs", () => {
    expect(helper).not.toContain("create(");
    expect(helper).not.toContain("reset(");
    expect(helper).not.toContain("shapeFromPath");
    expect(helper).not.toContain("shapeFromText");
  });
});
