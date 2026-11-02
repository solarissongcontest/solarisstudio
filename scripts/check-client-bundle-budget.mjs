import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { gzipSync } from "node:zlib";

import {
  CLIENT_BUNDLE_BUDGET,
  evaluateClientBundleBudget,
  isRelevantClientAsset,
} from "./lib/client-bundle-budget.mjs";

const root = process.cwd();
const distDir = path.join(root, "dist", "assets");
const ownershipPath = path.join(root, "dist", "client-bundle-ownership.json");
const reportPath = path.join(root, "client-bundle-budget-report.json");
const formatKiB = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;

const files = await readdir(distDir);
const relevant = files.filter(isRelevantClientAsset).sort();

if (!relevant.length) {
  throw new Error(`No JS/CSS assets found in ${distDir}`);
}

const measurements = [];
for (const name of relevant) {
  const filePath = path.join(distDir, name);
  const buffer = await readFile(filePath);
  const { size: rawBytes } = await stat(filePath);
  measurements.push({
    name,
    rawBytes,
    gzipBytes: gzipSync(buffer, { level: 9 }).byteLength,
  });
}

const result = evaluateClientBundleBudget(measurements);
const totalJsGzip = result.relevantAssets
  .filter((asset) => asset.name.endsWith(".js"))
  .reduce((sum, asset) => sum + asset.gzipBytes, 0);
const totalCssGzip = result.relevantAssets
  .filter((asset) => asset.name.endsWith(".css"))
  .reduce((sum, asset) => sum + asset.gzipBytes, 0);
const headroom = CLIENT_BUNDLE_BUDGET.maxTotalJsCssGzip - result.totalGzip;
const sortedAssets = [...result.relevantAssets].sort((a, b) => b.gzipBytes - a.gzipBytes);

let ownership = null;
try {
  ownership = JSON.parse(await readFile(ownershipPath, "utf8"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const report = {
  budget: CLIENT_BUNDLE_BUDGET,
  totals: {
    jsGzipBytes: totalJsGzip,
    cssGzipBytes: totalCssGzip,
    combinedGzipBytes: result.totalGzip,
    headroomBytes: headroom,
  },
  passed: result.failures.length === 0,
  failures: result.failures,
  assets: sortedAssets,
  largestOwnersByRenderedBytes: Array.isArray(ownership?.owners)
    ? ownership.owners.slice(0, 30)
    : [],
};
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

const summary =
  `JS ${formatKiB(totalJsGzip)} + CSS ${formatKiB(totalCssGzip)} = ` +
  `${formatKiB(result.totalGzip)} / ${formatKiB(CLIENT_BUNDLE_BUDGET.maxTotalJsCssGzip)} ` +
  `(${formatKiB(Math.abs(headroom))} ${headroom < 0 ? "over" : "headroom"}).`;

if (result.failures.length) {
  console.error("Client bundle budget failed:");
  for (const item of result.failures) {
    console.error(`- ${item.message}`);
    if (process.env.GITHUB_ACTIONS === "true") {
      console.error(`::error title=Client bundle budget::${item.message}`);
    }
  }
  console.error(`Measured ${result.relevantAssets.length} JS/CSS assets: ${summary}`);
  console.error("Largest gzip contributors:");
  for (const asset of sortedAssets.slice(0, 20)) {
    console.error(
      `- ${asset.name}: gzip ${formatKiB(asset.gzipBytes)}, raw ${formatKiB(asset.rawBytes)}`,
    );
  }
  if (report.largestOwnersByRenderedBytes.length) {
    console.error("Largest module/package owners by rendered bytes:");
    for (const owner of report.largestOwnersByRenderedBytes.slice(0, 20)) {
      console.error(
        `- ${owner.owner}: rendered ${formatKiB(owner.renderedBytes)} across ${owner.chunks.length} chunk(s)`,
      );
    }
  }
  process.exit(1);
}

console.log(
  `Client bundle budget passed for ${result.relevantAssets.length} assets (${summary})`,
);
console.log("Largest gzip contributors:");
for (const asset of sortedAssets.slice(0, 10)) {
  console.log(`- ${asset.name}: gzip ${formatKiB(asset.gzipBytes)}, raw ${formatKiB(asset.rawBytes)}`);
}
if (report.largestOwnersByRenderedBytes.length) {
  console.log("Largest module/package owners by rendered bytes:");
  for (const owner of report.largestOwnersByRenderedBytes.slice(0, 15)) {
    console.log(
      `- ${owner.owner}: rendered ${formatKiB(owner.renderedBytes)} across ${owner.chunks.length} chunk(s)`,
    );
  }
}
