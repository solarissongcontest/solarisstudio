import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const budget = readFileSync("scripts/check-client-bundle-budget.mjs", "utf8");

describe("client bundle performance budget", () => {
  it("keeps the established generated client thresholds", () => {
    expect(budget).toContain("maxSingleJsRaw: 1_050 * 1024");
    expect(budget).toContain("maxSingleJsGzip: 300 * 1024");
    expect(budget).toContain("maxSingleCssGzip: 45 * 1024");
    expect(budget).toContain("maxTotalJsCssGzip: 1_800 * 1024");
  });

  it("does not charge byte-identical public passthrough assets to the generated client bundle", () => {
    expect(budget).toContain('const PUBLIC_ASSET_ROOT = "public/assets"');
    expect(budget).toContain("sourceBytes.equals(outputBytes)");
    expect(budget).toContain(
      "const files = measuredAssets.filter((file) => !file.publicPassthrough);",
    );
    expect(budget).toContain("public passthrough assets:");
  });

  it("still budgets the deployed Nitro client asset directory", () => {
    expect(budget).toContain('".output/public/assets"');
  });
});
