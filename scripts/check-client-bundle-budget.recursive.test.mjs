import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const script = fileURLToPath(new URL("./check-client-bundle-budget.mjs", import.meta.url));
const FIXED_GZIP_CAP = 1_200 * 1024;

function exerciseBudget(assets, publicAssets = {}) {
  const cwd = mkdtempSync(join(tmpdir(), "solaris-budget-nested-"));
  const assetRoot = join(cwd, "generated");
  const reportPath = join(cwd, "client-budget.json");
  try {
    mkdirSync(assetRoot, { recursive: true });
    for (const [name, data] of Object.entries(assets)) {
      const path = join(assetRoot, name);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, data);
    }
    for (const [name, data] of Object.entries(publicAssets)) {
      const path = join(cwd, "public", "assets", name);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, data);
    }
    const result = spawnSync(process.execPath, [script], {
      cwd,
      env: {
        ...process.env,
        CLIENT_BUNDLE_ASSET_ROOT: assetRoot,
        CLIENT_BUNDLE_BUDGET_REPORT: reportPath,
        GITHUB_ACTIONS: "",
      },
      encoding: "utf8",
      timeout: 15_000,
    });
    assert.equal(result.error, undefined);
    return { result, report: JSON.parse(readFileSync(reportPath, "utf8")) };
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("nested generated JavaScript must count toward the stricter 1,200-KiB gzip cap", () => {
  const { result, report } = exerciseBudget({
    "entry.js": "console.log('small top-level entry');",
    "chunks/critical/generated.js": randomBytes(1_900_000),
  });
  assert.equal(result.status, 1);
  assert.equal(report.thresholdBytes, FIXED_GZIP_CAP);
  assert.equal(report.withinBudget, false);
  assert.ok(report.aggregateGzipBytes > FIXED_GZIP_CAP);
  assert.ok(report.assets.some((asset) => asset.path === "chunks/critical/generated.js"));
  assert.ok(report.failures.some((message) => message.includes("Total JS + CSS gzip")));
});

test("nested app-shell CSS still receives its tighter 15-KiB gzip budget", () => {
  const { result, report } = exerciseBudget({
    "entry.js": "console.log('entry');",
    "css/app-shell-example.css": randomBytes(17_000),
  });
  assert.equal(result.status, 1);
  assert.equal(report.withinBudget, false);
  assert.ok(report.aggregateGzipBytes < FIXED_GZIP_CAP);
  assert.ok(report.failures.some((message) => message.includes("App shell CSS gzip")));
});

test("split nested app-shell chunks cannot each evade the shared 15-KiB cap", () => {
  const { result, report } = exerciseBudget({
    "entry.js": "console.log('entry');",
    "css/a/app-shell-first.css": randomBytes(9_000),
    "css/b/app-shell-second.css": randomBytes(9_000),
  });
  assert.equal(result.status, 1);
  assert.equal(report.withinBudget, false);
  assert.ok(report.aggregateGzipBytes < FIXED_GZIP_CAP);
  assert.ok(report.failures.some((message) =>
    message.includes("App shell CSS gzip") &&
    message.includes("app-shell-first.css") &&
    message.includes("app-shell-second.css")));
});

test("nested public passthrough files are excluded only when byte-identical to public assets", () => {
  const bytes = randomBytes(1_900_000);
  const { result, report } = exerciseBudget({
    "entry.js": "console.log('entry');",
    "chunks/passthrough.js": bytes,
  }, { "chunks/passthrough.js": bytes });
  assert.equal(result.status, 0);
  assert.equal(report.withinBudget, true);
  assert.equal(report.thresholdBytes, FIXED_GZIP_CAP);
  assert.equal(report.publicPassthroughAssetCount, 1);
  assert.equal(report.javascriptAssetCount, 1);
});

test("nested CSS/JS symlinks fail closed rather than silently disappearing from measurement", () => {
  const cwd = mkdtempSync(join(tmpdir(), "solaris-budget-symlink-"));
  const assetRoot = join(cwd, "generated");
  const reportPath = join(cwd, "report.json");
  try {
    mkdirSync(join(assetRoot, "chunks"), { recursive: true });
    writeFileSync(join(assetRoot, "entry.js"), "console.log('entry')");
    symlinkSync(join(assetRoot, "entry.js"), join(assetRoot, "chunks", "hidden.js"));
    const result = spawnSync(process.execPath, [script], {
      cwd,
      env: { ...process.env, CLIENT_BUNDLE_ASSET_ROOT: assetRoot, CLIENT_BUNDLE_BUDGET_REPORT: reportPath },
      encoding: "utf8",
      timeout: 15_000,
    });
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    assert.equal(result.status, 1);
    assert.equal(report.withinBudget, false);
    assert.match(report.error, /symlink in generated assets/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
