import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const viteConfig = readFileSync("vite.config.ts", "utf8");
const budgetScript = readFileSync("scripts/check-client-bundle-budget.mjs", "utf8");
const attributionPlugin = readFileSync(
  "scripts/vite-client-bundle-attribution.ts",
  "utf8",
);

describe("V3 client bundle performance contract", () => {
  it("keeps TanStack route components automatically code split", () => {
    expect(viteConfig).toContain("autoCodeSplitting: true");
    expect(viteConfig).toContain("clientBundleAttributionPlugin()");
  });

  it("keeps the approved release budgets explicit and regression-protected", () => {
    expect(budgetScript).toContain("Changes to the limits must be explicit");
    expect(budgetScript).toContain("maxSingleJsRaw: 1_050 * 1024");
    expect(budgetScript).toContain("maxSingleJsGzip: 300 * 1024");
    expect(budgetScript).toContain("maxSingleCssGzip: 45 * 1024");
    expect(budgetScript).toContain("maxTotalJsCssGzip: 1_900 * 1024");
    expect(budgetScript).toContain("maxAppShellCssGzip: 15 * 1024");
    expect(budgetScript).toContain("maxGlobalStylesCssGzip: 48 * 1024");
  });

  it("publishes actionable budget and initial-graph attribution evidence", () => {
    expect(budgetScript).toContain('"budget-report.json"');
    expect(budgetScript).toContain('"budget-report.md"');
    expect(budgetScript).toContain("GITHUB_STEP_SUMMARY");
    expect(budgetScript).toContain("20 largest modules in the initial browser graph");
    expect(budgetScript).toContain("Server-only-looking modules in the initial browser graph");

    expect(attributionPlugin).toContain("entryChunks");
    expect(attributionPlugin).toContain("initialChunks");
    expect(attributionPlugin).toContain("dynamicChunks");
    expect(attributionPlugin).toContain("topInitialModules");
    expect(attributionPlugin).toContain("topInitialPackages");
    expect(attributionPlugin).toContain("serverOnlyCandidatesInInitialGraph");
    expect(attributionPlugin).toContain("chunk.imports");
    expect(attributionPlugin).toContain("chunk.dynamicImports");
  });
});
