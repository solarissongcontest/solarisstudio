import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const config = readFileSync("playwright.config.ts", "utf8");

describe("browser audit deterministic motion contract", () => {
  it("applies reduced motion after the desktop device descriptor", () => {
    const desktopUse = config.slice(
      config.indexOf("  use: {"),
      config.indexOf("  // CI starts and health-checks"),
    );
    expect(desktopUse.indexOf('...devices["Desktop Chrome"]')).toBeGreaterThanOrEqual(0);
    expect(desktopUse.indexOf('reducedMotion: "reduce"')).toBeGreaterThan(
      desktopUse.indexOf('...devices["Desktop Chrome"]'),
    );
  });

  it("reasserts reduced motion after every iPhone descriptor", () => {
    const iphoneBlocks = config.split('...devices["iPhone 13"],').slice(1);
    expect(iphoneBlocks).toHaveLength(6);
    for (const block of iphoneBlocks) {
      const useBlock = block.slice(0, block.indexOf("      },"));
      expect(useBlock).toContain('reducedMotion: "reduce"');
    }
  });
});
