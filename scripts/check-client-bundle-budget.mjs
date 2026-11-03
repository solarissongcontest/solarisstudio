import { readdir, readFile, stat } from "node:fs/promises";
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
const headroom = CLIENT_BUNDLE_BUDGET.maxTotalJsCssGzip - result.totalGzip;

if (result.failures.length) {
  console.error("Client bundle budget failed:");
  for (const item of result.failures) {
    console.error(`- ${item.message}`);
    if (process.env.GITHUB_ACTIONS === "true") {
      console.error(`::error title=Client bundle budget::${item.message}`);
    }
  }
  console.error(
    `Measured ${result.relevantAssets.length} JS/CSS assets: ${formatKiB(result.totalGzip)} / ` +
      `${formatKiB(CLIENT_BUNDLE_BUDGET.maxTotalJsCssGzip)} ` +
      `(${formatKiB(Math.abs(headroom))} ${headroom < 0 ? "over" : "headroom"}).`,
  );
  console.error("Largest gzip contributors:");
  for (const asset of [...result.relevantAssets]
    .sort((a, b) => b.gzipBytes - a.gzipBytes)
    .slice(0, 20)) {
    console.error(
      `- ${asset.name}: gzip ${formatKiB(asset.gzipBytes)}, raw ${formatKiB(asset.rawBytes)}`,
    );
  }
  process.exit(1);
}

console.log(
  `Client bundle budget passed for ${result.relevantAssets.length} assets ` +
    `(total gzip ${formatKiB(result.totalGzip)} / ${formatKiB(CLIENT_BUNDLE_BUDGET.maxTotalJsCssGzip)}; ` +
    `headroom ${formatKiB(headroom)}).`,
);
