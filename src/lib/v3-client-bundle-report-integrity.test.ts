import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const producer = resolve("scripts/check-client-bundle-budget.mjs");
const validator = resolve("scripts/validate-client-bundle-budget-report.mjs");
const temporary: string[] = [];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "solaris-verified-bundle-"));
  temporary.push(root);
  const assets = join(root, "assets");
  mkdirSync(assets);
  return { root, assets, reportPath: join(root, "bundle-report.json") };
}

function measure(assets: string, reportPath: string) {
  return spawnSync(process.execPath, [producer], {
    encoding: "utf8",
    env: {
      ...process.env,
      CLIENT_BUNDLE_ASSET_ROOT: assets,
      CLIENT_BUNDLE_BUDGET_REPORT: reportPath,
    },
  });
}

function validate(reportPath: string) {
  return spawnSync(process.execPath, [validator, reportPath], {
    encoding: "utf8",
  });
}

function reportFrom(path: string) {
  return JSON.parse(readFileSync(path, "utf8")) as {
    assets: Array<{ path: string; type: string; rawBytes: number; gzipBytes: number }>;
    javascriptGzipBytes: number;
    cssGzipBytes: number;
    aggregateGzipBytes: number;
    overBudgetBytes: number;
    withinBudget: boolean;
    failures: string[];
    [key: string]: unknown;
  };
}

afterEach(() => {
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("V3 exact generated client bundle budget evidence", () => {
  it("accepts the unmodified producer's measured under-budget report", () => {
    const { assets, reportPath } = fixture();
    writeFileSync(join(assets, "app.js"), "console.log('small');\\n");
    writeFileSync(join(assets, "styles-abc.css"), "body{display:block}\\n");
    expect(measure(assets, reportPath).status).toBe(0);
    const checked = validate(reportPath);
    expect(checked.status).toBe(0);
    expect(checked.stdout).toContain("withinBudget=true");
  });

  it("rejects a fabricated gzip measurement even when all reported totals agree", () => {
    const { assets, reportPath } = fixture();
    writeFileSync(join(assets, "app.js"), "export const proof = 'verified-bytes';\\n");
    expect(measure(assets, reportPath).status).toBe(0);
    const report = reportFrom(reportPath);
    report.assets[0].gzipBytes -= 1;
    report.javascriptGzipBytes -= 1;
    report.aggregateGzipBytes -= 1;
    report.overBudgetBytes = 0;
    report.withinBudget = true;
    report.failures = [];
    writeFileSync(reportPath, JSON.stringify(report));
    const checked = validate(reportPath);
    expect(checked.status).not.toBe(0);
    expect(checked.stderr).toContain("gzip byte count does not match generated asset");
  });

  it("rejects a green single-chunk result when the truthful report exceeds only a per-file limit", () => {
    const { assets, reportPath } = fixture();
    // The combined payload remains below 1.8 MiB, but one JS chunk is above 300 KiB gzip.
    writeFileSync(join(assets, "large.js"), randomBytes(350_000));
    expect(measure(assets, reportPath).status).not.toBe(0);
    const report = reportFrom(reportPath);
    expect(report.aggregateGzipBytes).toBeLessThan(1_800 * 1024);
    expect(report.withinBudget).toBe(false);
    // A valid *failing* evidence report is still authentic and must be readable.
    expect(validate(reportPath).status).toBe(0);

    report.withinBudget = true;
    report.failures = [];
    writeFileSync(reportPath, JSON.stringify(report));
    const checked = validate(reportPath);
    expect(checked.status).not.toBe(0);
    expect(checked.stderr).toContain("withinBudget does not match independently measured");
  });

  it("supports nested generated asset paths for the separately owned recursive producer integration", () => {
    const { assets, reportPath } = fixture();
    writeFileSync(join(assets, "app.js"), "export const nested = true;\\n");
    expect(measure(assets, reportPath).status).toBe(0);
    const report = reportFrom(reportPath);
    mkdirSync(join(assets, "chunks"));
    renameSync(join(assets, "app.js"), join(assets, "chunks", "app.js"));
    report.assets[0].path = "chunks/app.js";
    writeFileSync(reportPath, JSON.stringify(report));
    expect(validate(reportPath).status).toBe(0);
  });

  it("rejects reported assets that escape the measured build directory", () => {
    const { root, assets, reportPath } = fixture();
    writeFileSync(join(assets, "app.js"), "export const safe = true;\\n");
    expect(measure(assets, reportPath).status).toBe(0);
    const report = reportFrom(reportPath);
    renameSync(join(assets, "app.js"), join(root, "outside.js"));
    report.assets[0].path = "../outside.js";
    writeFileSync(reportPath, JSON.stringify(report));
    const checked = validate(reportPath);
    expect(checked.status).not.toBe(0);
    expect(checked.stderr).toContain("reported asset escapes the measured tree");
  });
});
