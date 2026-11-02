import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import {
  CLIENT_BUNDLE_BUDGET,
  evaluateClientBundleBudget,
} from "./lib/client-bundle-budget.mjs";

const ROOTS = [
  ".output/public/assets",
  "dist/client/assets",
  "dist/assets",
];
const PUBLIC_ASSET_ROOT = "public/assets";

const assetRoot = ROOTS.find((root) => existsSync(root));
if (!assetRoot) {
  console.error(
    "Solaris client budget: no production asset directory found. Run the production build first.",
  );
  process.exit(1);
}

function measureAsset(name, bytes) {
  return {
    name,
    rawBytes: bytes.byteLength,
    gzipBytes: gzipSync(bytes, { level: 9 }).byteLength,
  };
}

function isPublicPassthrough(name, outputBytes) {
  const sourcePath = join(PUBLIC_ASSET_ROOT, name);
  if (!existsSync(sourcePath)) return false;
  return readFileSync(sourcePath).equals(outputBytes);
}

const measuredAssets = readdirSync(assetRoot)
  .filter((name) => /\.(?:js|css)$/.test(name))
  .map((name) => {
    const bytes = readFileSync(join(assetRoot, name));
    return {
      ...measureAsset(name, bytes),
      publicPassthrough: isPublicPassthrough(name, bytes),
    };
  });

const publicPassthrough = measuredAssets.filter((asset) => asset.publicPassthrough);
const generatedAssets = measuredAssets
  .filter((asset) => !asset.publicPassthrough)
  .map(({ name, rawBytes, gzipBytes }) => ({ name, rawBytes, gzipBytes }));

if (!generatedAssets.length) {
  console.error(
    `Solaris client budget: no generated JS/CSS assets found in ${assetRoot}.`,
  );
  process.exit(1);
}

const result = evaluateClientBundleBudget(generatedAssets);
const js = result.relevantAssets.filter((asset) => asset.name.endsWith(".js"));
const css = result.relevantAssets.filter((asset) => asset.name.endsWith(".css"));
const largestJsRaw = [...js].sort((a, b) => b.rawBytes - a.rawBytes)[0];
const largestJsGzip = [...js].sort((a, b) => b.gzipBytes - a.gzipBytes)[0];
const largestCssGzip = [...css].sort((a, b) => b.gzipBytes - a.gzipBytes)[0];
const passthroughGzip = publicPassthrough.reduce(
  (sum, asset) => sum + asset.gzipBytes,
  0,
);
const appShell = css.find((asset) => /^app-shell-.*\.css$/.test(asset.name));
const globalStyles = css.find((asset) => /^(?:styles|index)-.*\.css$/.test(asset.name));

const kib = (bytes) => (bytes / 1024).toFixed(1);

function escapeWorkflowCommand(value) {
  return String(value)
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
}

function emitWorkflowAnnotation(level, title, message) {
  if (!process.env.GITHUB_ACTIONS) return;
  console.log(
    `::${level} title=${escapeWorkflowCommand(title)}::${escapeWorkflowCommand(message)}`,
  );
}

const diagnosticSummary = [
  `root=${assetRoot}`,
  `generated=${result.relevantAssets.length}`,
  `passthrough=${publicPassthrough.length}`,
  `passthrough_gzip=${kib(passthroughGzip)} KiB`,
  `largest_js_raw=${largestJsRaw?.name ?? "n/a"}:${kib(largestJsRaw?.rawBytes ?? 0)} KiB`,
  `largest_js_gzip=${largestJsGzip?.name ?? "n/a"}:${kib(largestJsGzip?.gzipBytes ?? 0)} KiB`,
  `largest_css_gzip=${largestCssGzip?.name ?? "n/a"}:${kib(largestCssGzip?.gzipBytes ?? 0)} KiB`,
  `total_gzip=${kib(result.totalGzip)} KiB`,
  `budget_gzip=${kib(CLIENT_BUNDLE_BUDGET.maxTotalJsCssGzip)} KiB`,
  `app_shell_gzip=${appShell ? `${kib(appShell.gzipBytes)} KiB` : "n/a"}`,
  `global_styles_gzip=${globalStyles ? `${kib(globalStyles.gzipBytes)} KiB` : "n/a"}`,
].join("; ");

console.log("Solaris Studio client performance budget");
console.log(`  generated assets: ${result.relevantAssets.length} from ${assetRoot}`);
if (publicPassthrough.length) {
  console.log(
    `  public passthrough assets: ${publicPassthrough.length} excluded · ${kib(passthroughGzip)} KiB gzip`,
  );
}
console.log(
  `  largest JS raw: ${largestJsRaw?.name ?? "n/a"} · ${kib(largestJsRaw?.rawBytes ?? 0)} KiB`,
);
console.log(
  `  largest JS gzip: ${largestJsGzip?.name ?? "n/a"} · ${kib(largestJsGzip?.gzipBytes ?? 0)} KiB`,
);
console.log(
  `  largest CSS gzip: ${largestCssGzip?.name ?? "n/a"} · ${kib(largestCssGzip?.gzipBytes ?? 0)} KiB`,
);
console.log(
  `  total JS + CSS gzip: ${kib(result.totalGzip)} KiB / ${kib(CLIENT_BUNDLE_BUDGET.maxTotalJsCssGzip)} KiB`,
);
if (appShell) console.log(`  app shell CSS gzip: ${kib(appShell.gzipBytes)} KiB`);
if (globalStyles) console.log(`  global styles CSS gzip: ${kib(globalStyles.gzipBytes)} KiB`);

if (result.failures.length) {
  console.error("\nClient performance budget exceeded:");
  for (const failure of result.failures) console.error(`  - ${failure.message}`);
  emitWorkflowAnnotation(
    "error",
    "Client performance budget exceeded",
    `${result.failures.map(({ message }) => message).join(" | ")} | ${diagnosticSummary}`,
  );
  process.exit(1);
}

emitWorkflowAnnotation("notice", "Client performance budget", diagnosticSummary);
console.log("Client performance budget passed.");
