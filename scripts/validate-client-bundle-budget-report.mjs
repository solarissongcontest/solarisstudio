import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { gzipSync } from "node:zlib";

const reportPath =
  process.argv[2] ??
  process.env.CLIENT_BUNDLE_BUDGET_REPORT ??
  "client-bundle-budget-report.json";
const CANONICAL_THRESHOLD_BYTES = 1_800 * 1024;
// These per-file limits are identical to the producer's canonical budgets.
// A report may fail any single-file budget even when its total is under 1.8 MiB.
const SINGLE_JS_RAW_LIMIT = 1_050 * 1024;
const SINGLE_JS_GZIP_LIMIT = 300 * 1024;
const SINGLE_CSS_GZIP_LIMIT = 45 * 1024;
const APP_SHELL_CSS_GZIP_LIMIT = 15 * 1024;
const GLOBAL_STYLES_CSS_GZIP_LIMIT = 48 * 1024;

function fail(message) {
  console.error(`Invalid client bundle budget report: ${message}`);
  process.exit(1);
}

if (!existsSync(reportPath)) fail(`missing ${reportPath}`);
const source = readFileSync(reportPath, "utf8");
if (!source.trim()) fail(`${reportPath} is empty`);

let report;
try {
  report = JSON.parse(source);
} catch (error) {
  fail(`${reportPath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
}

const integerFields = [
  "thresholdBytes",
  "javascriptGzipBytes",
  "cssGzipBytes",
  "aggregateGzipBytes",
  "overBudgetBytes",
  "assetCount",
  "javascriptAssetCount",
  "cssAssetCount",
];
for (const field of integerFields) {
  if (!Number.isInteger(report[field]) || report[field] < 0) {
    fail(`${field} must be a non-negative integer`);
  }
}
if (report.thresholdBytes !== CANONICAL_THRESHOLD_BYTES) {
  fail(
    `thresholdBytes=${report.thresholdBytes}, expected canonical ${CANONICAL_THRESHOLD_BYTES}`,
  );
}
if (report.aggregateGzipBytes !== report.javascriptGzipBytes + report.cssGzipBytes) {
  fail("aggregateGzipBytes must equal javascriptGzipBytes + cssGzipBytes");
}
const expectedOverage = Math.max(0, report.aggregateGzipBytes - report.thresholdBytes);
if (report.overBudgetBytes !== expectedOverage) {
  fail(`overBudgetBytes=${report.overBudgetBytes}, expected ${expectedOverage}`);
}
if (typeof report.withinBudget !== "boolean") {
  fail("withinBudget must be boolean");
}
if (report.overBudgetBytes > 0 && report.withinBudget) {
  fail("withinBudget cannot be true while aggregate payload exceeds the threshold");
}
if (typeof report.assetRoot !== "string" || !report.assetRoot) {
  fail("assetRoot must identify the measured production tree");
}
if (!Array.isArray(report.assets)) fail("assets must be an array");
if (report.assets.length === 0) fail("a passing or measured report requires generated JS/CSS assets");
if (!Array.isArray(report.failures) || !report.failures.every((value) => typeof value === "string")) {
  fail("failures must be an array of diagnostic strings");
}
if (report.assetCount !== report.assets.length) {
  fail(`assetCount=${report.assetCount}, assets.length=${report.assets.length}`);
}

let jsCount = 0;
let cssCount = 0;
let jsGzip = 0;
let cssGzip = 0;
let thresholdViolated = false;
const measuredRoot = resolve(report.assetRoot);
const visitedPaths = new Set();
for (const asset of report.assets) {
  if (!asset || typeof asset.path !== "string" || !asset.path) fail("asset path is missing");
  if (asset.type !== "js" && asset.type !== "css") fail(`invalid asset type for ${asset.path}`);
  if (!Number.isInteger(asset.rawBytes) || asset.rawBytes < 0) fail(`invalid rawBytes for ${asset.path}`);
  if (!Number.isInteger(asset.gzipBytes) || asset.gzipBytes < 0) fail(`invalid gzipBytes for ${asset.path}`);
  // Nested generated chunks are allowed, but no report entry can escape the
  // measured root or count one asset repeatedly.
  const assetPath = resolve(measuredRoot, asset.path);
  const inside = relative(measuredRoot, assetPath);
  if (!inside || inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
    fail(`reported asset escapes the measured tree: ${asset.path}`);
  }
  if (visitedPaths.has(assetPath)) fail(`duplicate reported asset: ${asset.path}`);
  visitedPaths.add(assetPath);
  if (!asset.path.endsWith(`.${asset.type}`)) fail(`asset type does not match path: ${asset.path}`);
  if (!existsSync(assetPath)) fail(`reported asset does not exist: ${assetPath}`);
  if (statSync(assetPath).size !== asset.rawBytes) fail(`raw byte count does not match ${asset.path}`);
  const actualGzip = gzipSync(readFileSync(assetPath), { level: 9 }).byteLength;
  if (actualGzip !== asset.gzipBytes) {
    fail(`gzip byte count does not match generated asset ${asset.path}: reported ${asset.gzipBytes}, actual ${actualGzip}`);
  }
  if (asset.type === "js") {
    jsCount += 1;
    jsGzip += actualGzip;
    if (asset.rawBytes > SINGLE_JS_RAW_LIMIT || actualGzip > SINGLE_JS_GZIP_LIMIT) {
      thresholdViolated = true;
    }
  } else {
    cssCount += 1;
    cssGzip += actualGzip;
    if (actualGzip > SINGLE_CSS_GZIP_LIMIT ||
        (/^app-shell-.*\\.css$/.test(basename(asset.path)) && actualGzip > APP_SHELL_CSS_GZIP_LIMIT) ||
        (/^styles-.*\\.css$/.test(basename(asset.path)) && actualGzip > GLOBAL_STYLES_CSS_GZIP_LIMIT)) {
      thresholdViolated = true;
    }
  }
}
if (jsCount !== report.javascriptAssetCount) fail("javascriptAssetCount does not match assets");
if (cssCount !== report.cssAssetCount) fail("cssAssetCount does not match assets");
if (jsGzip !== report.javascriptGzipBytes) fail("javascriptGzipBytes does not match asset sum");
if (cssGzip !== report.cssGzipBytes) fail("cssGzipBytes does not match asset sum");
if (report.aggregateGzipBytes > CANONICAL_THRESHOLD_BYTES) thresholdViolated = true;
if (report.withinBudget === thresholdViolated) {
  fail("withinBudget does not match independently measured total and per-asset thresholds");
}
if (report.withinBudget && report.failures.length > 0) {
  fail("a passing report cannot contain budget failures");
}
if (!report.withinBudget && report.failures.length === 0) {
  fail("a failing report must include budget failure diagnostics");
}

console.log(
  `Valid client bundle report: ${report.aggregateGzipBytes}/${report.thresholdBytes} bytes, ${report.assetCount} assets, withinBudget=${report.withinBudget}`,
);
