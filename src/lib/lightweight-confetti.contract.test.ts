import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");
const vite = source("vite.config.ts");
const confetti = source("src/lib/lightweight-confetti.ts");

describe("lightweight broadcast confetti", () => {
  it("replaces only canvas-confetti through the production resolver", () => {
    expect(vite).toContain('"canvas-confetti": fileURLToPath(');
    expect(vite).toContain('new URL("./src/lib/lightweight-confetti.ts", import.meta.url)');
  });

  it("preserves reduced-motion and accessibility behavior", () => {
    expect(confetti).toContain('matchMedia("(prefers-reduced-motion: reduce)").matches');
    expect(confetti).toContain('canvas.setAttribute("aria-hidden", "true")');
    expect(confetti).toContain('pointerEvents: "none"');
    expect(confetti).toContain("canvas.remove()");
  });

  it("keeps the supported one-shot option surface bounded", () => {
    expect(confetti).toContain("particleCount?: number");
    expect(confetti).toContain("spread?: number");
    expect(confetti).toContain("origin?: { y?: number }");
    expect(confetti).toContain("Math.min(240");
  });
});
