import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

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

const BUDGETS = {
  maxSingleJsRaw: 1_050 * 1024,
  maxSingleJsGzip: 300 * 1024,
  maxSingleCssGzip: 45 * 1024,
  maxTotalJsCssGzip: 1_800 * 1024,
  maxAppShellCssGzip: 15 * 1024,
  maxGlobalStylesCssGzip: 48 * 1024,
};

function measureAsset(name, bytes) {
  return {
    name,
    type: name.endsWith(".js") ? "js" : "css",
    raw: bytes.byteLength,
    gzip: gzipSync(bytes, { level: 9 }).byteLength,
  };
}

function isPublicPassthrough(name, outputBytes) {
  const sourcePath = join(PUBLIC_ASSET_ROOT, name);
  if (!existsSync(sourcePath)) return false;

  const sourceBytes = readFileSync(sourcePath);
  return sourceBytes.equals(outputBytes);
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

const publicPassthrough = measuredAssets.filter((file) => file.publicPassthrough);
const files = measuredAssets.filter((file) => !file.publicPassthrough);

if (!files.length) {
  console.error(
    `Solaris client budget: no generated JS/CSS assets found in ${assetRoot}.`,
  );
  process.exit(1);
}

const js = files.filter((file) => file.type === "js");
const css = files.filter((file) => file.type === "css");
const largestJsRaw = [...js].sort((a, b) => b.raw - a.raw)[0];
const largestJsGzip = [...js].sort((a, b) => b.gzip - a.gzip)[0];
const largestCssGzip = [...css].sort((a, b) => b.gzip - a.gzip)[0];
const totalGzip = files.reduce((sum, file) => sum + file.gzip, 0);
const passthroughGzip = publicPassthrough.reduce(
  (sum, file) => sum + file.gzip,
  0,
);
const appShell = css.find((file) => /^app-shell-.*\.css$/.test(file.name));
const globalStyles = css.find((file) => /^styles-.*\.css$/.test(file.name));

const kb = (bytes) => (bytes / 1024).toFixed(1);
const failures = [];

function enforce(label, actual, limit, file) {
  if (actual <= limit) return;
  failures.push(
    `${label}: ${kb(actual)} KiB > ${kb(limit)} KiB${file ? ` (${file})` : ""}`,
  );
}

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


// Report every violating asset, not just the maximum, so one repair does not
// hide the next offending chunk until another expensive build.
for (const file of js) {
  enforce("JS raw", file.raw, BUDGETS.maxSingleJsRaw, file.name);
  enforce("JS gzip", file.gzip, BUDGETS.maxSingleJsGzip, file.name);
}
for (const file of css) {
  enforce("CSS gzip", file.gzip, BUDGETS.maxSingleCssGzip, file.name);
}
enforce("Total JS + CSS gzip", totalGzip, BUDGETS.maxTotalJsCssGzip);
if (appShell) {
  enforce(
    "App shell CSS gzip",
    appShell.gzip,
    BUDGETS.maxAppShellCssGzip,
    appShell.name,
  );
}
if (globalStyles) {
  enforce(
    "Global styles CSS gzip",
    globalStyles.gzip,
    BUDGETS.maxGlobalStylesCssGzip,
    globalStyles.name,
  );
}

const diagnosticSummary = [
  `root=${assetRoot}`,
  `generated=${files.length}`,
  `passthrough=${publicPassthrough.length}`,
  `passthrough_gzip=${kb(passthroughGzip)} KiB`,
  `largest_js_raw=${largestJsRaw?.name ?? "n/a"}:${kb(largestJsRaw?.raw ?? 0)} KiB`,
  `largest_js_gzip=${largestJsGzip?.name ?? "n/a"}:${kb(largestJsGzip?.gzip ?? 0)} KiB`,
  `largest_css_gzip=${largestCssGzip?.name ?? "n/a"}:${kb(largestCssGzip?.gzip ?? 0)} KiB`,
  `total_gzip=${kb(totalGzip)} KiB`,
  `app_shell_gzip=${appShell ? `${kb(appShell.gzip)} KiB` : "n/a"}`,
  `global_styles_gzip=${globalStyles ? `${kb(globalStyles.gzip)} KiB` : "n/a"}`,
].join("; ");

console.log("Solaris Studio client performance budget");
console.log(`  generated assets: ${files.length} from ${assetRoot}`);
if (publicPassthrough.length) {
  console.log(
    `  public passthrough assets: ${publicPassthrough.length} excluded · ${kb(passthroughGzip)} KiB gzip`,
  );
}
console.log(
  `  largest JS raw: ${largestJsRaw?.name ?? "n/a"} · ${kb(largestJsRaw?.raw ?? 0)} KiB`,
);
console.log(
  `  largest JS gzip: ${largestJsGzip?.name ?? "n/a"} · ${kb(largestJsGzip?.gzip ?? 0)} KiB`,
);
console.log(
  `  largest CSS gzip: ${largestCssGzip?.name ?? "n/a"} · ${kb(largestCssGzip?.gzip ?? 0)} KiB`,
);
console.log(`  total JS + CSS gzip: ${kb(totalGzip)} KiB`);
if (appShell) console.log(`  app shell CSS gzip: ${kb(appShell.gzip)} KiB`);
if (globalStyles) console.log(`  global styles CSS gzip: ${kb(globalStyles.gzip)} KiB`);

if (failures.length) {
  if (totalGzip > BUDGETS.maxTotalJsCssGzip) {
    console.error("\nLargest contributors to aggregate JS + CSS gzip:");
    for (const file of [...files].sort((a, b) => b.gzip - a.gzip).slice(0, 10)) {
      console.error(`  - ${file.name}: ${kb(file.gzip)} KiB gzip (${kb(file.raw)} KiB raw)`);
    }
  }
  console.error("\nClient performance budget exceeded:");
  for (const failure of failures) console.error(`  - ${failure}`);
  emitWorkflowAnnotation(
    "error",
    "Client performance budget exceeded",
    `${failures.join(" | ")} | ${diagnosticSummary}`,
  );
  process.exit(1);
}

emitWorkflowAnnotation("notice", "Client performance budget", diagnosticSummary);
console.log("Client performance budget passed.");
