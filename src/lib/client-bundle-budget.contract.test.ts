import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");
const budget = source("scripts/check-client-bundle-budget.mjs");
const validator = source("scripts/validate-client-bundle-budget-report.mjs");
const packageJson = source("package.json");
const quality = source(".github/workflows/ci.yml");
const browserAudit = source(".github/workflows/browser-audit.yml");
const budgetScript = resolve("scripts/check-client-bundle-budget.mjs");
const validatorScript = resolve("scripts/validate-client-bundle-budget-report.mjs");
const tempRoots: string[] = [];

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), "solaris-client-budget-"));
  tempRoots.push(root);
  const assetRoot = join(root, "assets");
  mkdirSync(assetRoot, { recursive: true });
  return { root, assetRoot, reportPath: join(root, "client-bundle-budget-report.json") };
}

function runBudget(assetRoot: string, reportPath: string) {
  return spawnSync(process.execPath, [budgetScript], {
    cwd: resolve("."),
    env: {
      ...process.env,
      CLIENT_BUNDLE_ASSET_ROOT: assetRoot,
      CLIENT_BUNDLE_BUDGET_REPORT: reportPath,
    },
    encoding: "utf8",
  });
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("client bundle performance budget", () => {
  it("keeps the canonical production threshold at 1.8 MiB", () => {
    expect(budget).toContain("maxSingleJsRaw: 1_050 * 1024");
    expect(budget).toContain("maxSingleJsGzip: 300 * 1024");
    expect(budget).toContain("maxSingleCssGzip: 45 * 1024");
    expect(budget).toContain("maxTotalJsCssGzip: 1_800 * 1024");
    expect(budget).not.toContain("maxTotalJsCssGzip: 2_200 * 1024");
    expect(validator).toContain("const CANONICAL_THRESHOLD_BYTES = 1_800 * 1024");
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

  it("writes a consistent machine-readable report and succeeds under budget", () => {
    const { assetRoot, reportPath } = fixtureRoot();
    writeFileSync(join(assetRoot, "app.js"), "console.log('small');\n");
    writeFileSync(join(assetRoot, "styles.css"), "body{display:block}\n");

    const result = runBudget(assetRoot, reportPath);
    expect(result.status).toBe(0);
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    expect(report.thresholdBytes).toBe(1_800 * 1024);
    expect(report.withinBudget).toBe(true);
    expect(report.aggregateGzipBytes).toBe(
      report.javascriptGzipBytes + report.cssGzipBytes,
    );
    expect(report.assetCount).toBe(report.assets.length);
    expect(report.javascriptAssetCount + report.cssAssetCount).toBe(report.assetCount);

    const validation = spawnSync(process.execPath, [validatorScript, reportPath], {
      encoding: "utf8",
    });
    expect(validation.status).toBe(0);
  });

  it("writes exact aggregate and overage evidence while preserving an over-budget failure", () => {
    const { assetRoot, reportPath } = fixtureRoot();
    const bytes = randomBytes(1_900_000);
    writeFileSync(join(assetRoot, "oversized.js"), bytes);
    const expectedGzip = gzipSync(bytes, { level: 9 }).byteLength;

    const result = runBudget(assetRoot, reportPath);
    expect(result.status).not.toBe(0);
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    expect(report.javascriptGzipBytes).toBe(expectedGzip);
    expect(report.cssGzipBytes).toBe(0);
    expect(report.aggregateGzipBytes).toBe(expectedGzip);
    expect(report.overBudgetBytes).toBe(expectedGzip - 1_800 * 1024);
    expect(report.withinBudget).toBe(false);

    const validation = spawnSync(process.execPath, [validatorScript, reportPath], {
      encoding: "utf8",
    });
    expect(validation.status).toBe(0);
  });

  it("fails explicitly when the production asset tree is missing without fabricating zero-byte success", () => {
    const { root, reportPath } = fixtureRoot();
    const missingRoot = join(root, "does-not-exist");
    const result = runBudget(missingRoot, reportPath);

    expect(result.status).not.toBe(0);
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    expect(report.withinBudget).toBe(false);
    expect(report.error).toContain("no production asset directory found");
    expect(report).not.toHaveProperty("aggregateGzipBytes", 0);

    const validation = spawnSync(process.execPath, [validatorScript, reportPath], {
      encoding: "utf8",
    });
    expect(validation.status).not.toBe(0);
  });

  it("rejects inconsistent report totals", () => {
    const { assetRoot, reportPath } = fixtureRoot();
    writeFileSync(join(assetRoot, "app.js"), "export const ok = true;\n");
    expect(runBudget(assetRoot, reportPath).status).toBe(0);
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    report.aggregateGzipBytes += 1;
    writeFileSync(reportPath, `${JSON.stringify(report)}\n`);

    const validation = spawnSync(process.execPath, [validatorScript, reportPath], {
      encoding: "utf8",
    });
    expect(validation.status).not.toBe(0);
    expect(validation.stderr).toContain(
      "aggregateGzipBytes must equal javascriptGzipBytes + cssGzipBytes",
    );
  });
});
