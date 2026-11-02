import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");
const budget = source("scripts/check-client-bundle-budget.mjs");
const packageJson = source("package.json");
const quality = source(".github/workflows/ci.yml");
const browserAudit = source(".github/workflows/browser-audit.yml");

describe("client bundle performance budget", () => {
  it("keeps the canonical production threshold at 1.8 MiB", () => {
    expect(budget).toContain("maxSingleJsRaw: 1_050 * 1024");
    expect(budget).toContain("maxSingleJsGzip: 300 * 1024");
    expect(budget).toContain("maxSingleCssGzip: 45 * 1024");
    expect(budget).toContain("maxTotalJsCssGzip: 1_800 * 1024");
    expect(budget).not.toContain("maxTotalJsCssGzip: 2_200 * 1024");
  });

  it("routes production, Quality and Browser Audit through the same canonical budget owner", () => {
    expect(packageJson).toContain('"budget:client": "node scripts/check-client-bundle-budget.mjs"');
    expect(quality).toContain("- name: Enforce client performance budget");
    expect(quality).toContain("run: bun run budget:client");
    expect(browserAudit).toContain("- name: Enforce client performance budget");
    expect(browserAudit).toContain("run: bun run budget:client");
  });

  it("does not charge byte-identical public passthrough assets to the generated client bundle", () => {
    expect(budget).toContain('const PUBLIC_ASSET_ROOT = "public/assets"');
    expect(budget).toContain("sourceBytes.equals(outputBytes)");
    expect(budget).toContain(
      "const files = measuredAssets.filter((file) => !file.publicPassthrough);",
    );
    expect(budget).toContain("public passthrough assets:");
  });

  it("budgets the deployed Nitro client asset directory before legacy build fallbacks", () => {
    expect(budget).toContain('".output/public/assets"');
    expect(budget.indexOf('".output/public/assets"')).toBeLessThan(
      budget.indexOf('"dist/client/assets"'),
    );
  });
});
