import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const config = readFileSync("playwright.config.ts", "utf8");

describe("browser audit deterministic motion contract", () => {
  it("applies reduced motion after the desktop device descriptor", () => {
    const configStart = config.indexOf("export default defineConfig({");
    const useStart = config.indexOf(
      '  use: {\n    ...devices["Desktop Chrome"],',
      configStart,
    );
    const useEnd = config.indexOf("\n  webServer:", useStart);

    expect(configStart).toBeGreaterThanOrEqual(0);
    expect(useStart).toBeGreaterThan(configStart);
    expect(useEnd).toBeGreaterThan(useStart);

    const desktopUse = config.slice(useStart, useEnd);
    expect(desktopUse.indexOf('...devices["Desktop Chrome"]')).toBeGreaterThanOrEqual(0);
    expect(desktopUse.indexOf('reducedMotion: "reduce"')).toBeGreaterThan(
      desktopUse.indexOf('...devices["Desktop Chrome"]'),
    );
  });

  it("reasserts reduced motion after every iPhone descriptor", () => {
    const iphoneBlocks = config.split('...devices["iPhone 13"],').slice(1);

    // The exact number can grow as representative projects are added. What must
    // never regress is the local reassertion immediately after each descriptor.
    expect(iphoneBlocks.length).toBeGreaterThanOrEqual(6);
    for (const block of iphoneBlocks) {
      expect(block.slice(0, 420)).toContain('reducedMotion: "reduce"');
    }
  });
});
