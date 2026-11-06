import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const reportPath =
  process.argv[2] ??
  process.env.CLIENT_BUNDLE_BUDGET_REPORT ??
  "client-bundle-budget-report.json";
const CANONICAL_THRESHOLD_BYTES = 1_800 * 1024;

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
if (report.assetCount !== report.assets.length) {
  fail(`assetCount=${report.assetCount}, assets.length=${report.assets.length}`);
}

let jsCount = 0;
let cssCount = 0;
let jsGzip = 0;
let cssGzip = 0;
for (const asset of report.assets) {
  if (!asset || typeof asset.path !== "string" || !asset.path) fail("asset path is missing");
  if (asset.type !== "js" && asset.type !== "css") fail(`invalid asset type for ${asset.path}`);
  if (!Number.isInteger(asset.rawBytes) || asset.rawBytes < 0) fail(`invalid rawBytes for ${asset.path}`);
  if (!Number.isInteger(asset.gzipBytes) || asset.gzipBytes < 0) fail(`invalid gzipBytes for ${asset.path}`);
  const assetPath = join(report.assetRoot, asset.path);
  if (!existsSync(assetPath)) fail(`reported asset does not exist: ${assetPath}`);
  if (statSync(assetPath).size !== asset.rawBytes) fail(`raw byte count does not match ${asset.path}`);
  if (asset.type === "js") {
    jsCount += 1;
    jsGzip += asset.gzipBytes;
  } else {
    cssCount += 1;
    cssGzip += asset.gzipBytes;
  }
}
if (jsCount !== report.javascriptAssetCount) fail("javascriptAssetCount does not match assets");
if (cssCount !== report.cssAssetCount) fail("cssAssetCount does not match assets");
if (jsGzip !== report.javascriptGzipBytes) fail("javascriptGzipBytes does not match asset sum");
if (cssGzip !== report.cssGzipBytes) fail("cssGzipBytes does not match asset sum");

console.log(
  `Valid client bundle report: ${report.aggregateGzipBytes}/${report.thresholdBytes} bytes, ${report.assetCount} assets, withinBudget=${report.withinBudget}`,
);
