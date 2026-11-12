import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { gzipSync } from "node:zlib";

const ROOTS = [
  ".output/public/assets",
  "dist/client/assets",
  "dist/assets",
];
const PUBLIC_ASSET_ROOT = "public/assets";
const REPORT_PATH =
  process.env.CLIENT_BUNDLE_BUDGET_REPORT ?? "client-bundle-budget-report.json";

const BUDGETS = {
  maxSingleJsRaw: 1_050 * 1024,
  maxSingleJsGzip: 300 * 1024,
  maxSingleCssGzip: 45 * 1024,
  maxTotalJsCssGzip: 1_800 * 1024,
  maxAppShellCssGzip: 15 * 1024,
  maxGlobalStylesCssGzip: 48 * 1024,
};

function writeReport(report) {
  const parent = dirname(REPORT_PATH);
  if (parent && parent !== ".") mkdirSync(parent, { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
}

function failBeforeMeasurement(message) {
  writeReport({
    schemaVersion: 1,
    thresholdBytes: BUDGETS.maxTotalJsCssGzip,
    withinBudget: false,
    error: message,
  });
  console.error(message);
  process.exit(1);
}

const configuredRoot = process.env.CLIENT_BUNDLE_ASSET_ROOT;
const assetRoot = configuredRoot ?? ROOTS.find((root) => existsSync(root));
if (!assetRoot || !existsSync(assetRoot)) {
  failBeforeMeasurement(
    "Solaris client budget: no production asset directory found. Run the production build first.",
  );
}

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

// Generated Vite assets may be organized under subdirectories. A flat scan
// silently undercounts nested bundles and can falsely certify an oversized app.
function generatedAssetPaths(root, relative = "") {
  const directory = join(root, relative);
  return readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const name = relative ? join(relative, entry.name) : entry.name;
      if (entry.isDirectory()) return generatedAssetPaths(root, name);
      if (entry.isSymbolicLink()) {
        // Do not allow generated JS/CSS to bypass measurement through links.
        failBeforeMeasurement(`Solaris client budget: symlink in generated assets: ${name}`);
      }
      return entry.isFile() && /\.(?:js|css)$/.test(entry.name) ? [name] : [];
    });
}

const measuredAssets = generatedAssetPaths(assetRoot)
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
  failBeforeMeasurement(
    `Solaris client budget: no generated JS/CSS assets found in ${assetRoot}.`,
  );
}

const js = files.filter((file) => file.type === "js");
const css = files.filter((file) => file.type === "css");
const largestJsRaw = [...js].sort((a, b) => b.raw - a.raw)[0];
const largestJsGzip = [...js].sort((a, b) => b.gzip - a.gzip)[0];
const largestCssGzip = [...css].sort((a, b) => b.gzip - a.gzip)[0];
const javascriptGzipBytes = js.reduce((sum, file) => sum + file.gzip, 0);
const cssGzipBytes = css.reduce((sum, file) => sum + file.gzip, 0);
const totalGzip = javascriptGzipBytes + cssGzipBytes;
const passthroughGzip = publicPassthrough.reduce(
  (sum, file) => sum + file.gzip,
  0,
);
const appShell = css.filter((file) => /^app-shell-.*\.css$/.test(basename(file.name)));
const globalStyles = css.filter((file) => /^styles-.*\.css$/.test(basename(file.name)));
const appShellGzip = appShell.reduce((total, file) => total + file.gzip, 0);
const globalStylesGzip = globalStyles.reduce((total, file) => total + file.gzip, 0);

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

enforce(
  "Largest JS raw",
  largestJsRaw?.raw ?? 0,
  BUDGETS.maxSingleJsRaw,
  largestJsRaw?.name,
);
enforce(
  "Largest JS gzip",
  largestJsGzip?.gzip ?? 0,
  BUDGETS.maxSingleJsGzip,
  largestJsGzip?.name,
);
enforce(
  "Largest CSS gzip",
  largestCssGzip?.gzip ?? 0,
  BUDGETS.maxSingleCssGzip,
  largestCssGzip?.name,
);
enforce("Total JS + CSS gzip", totalGzip, BUDGETS.maxTotalJsCssGzip);
if (appShell.length) {
  enforce(
    "App shell CSS gzip",
    appShellGzip,
    BUDGETS.maxAppShellCssGzip,
    appShell.map((file) => file.name).join(", "),
  );
}
if (globalStyles.length) {
  enforce(
    "Global styles CSS gzip",
    globalStylesGzip,
    BUDGETS.maxGlobalStylesCssGzip,
    globalStyles.map((file) => file.name).join(", "),
  );
}

const report = {
  schemaVersion: 1,
  assetRoot,
  thresholdBytes: BUDGETS.maxTotalJsCssGzip,
  javascriptGzipBytes,
  cssGzipBytes,
  aggregateGzipBytes: totalGzip,
  overBudgetBytes: Math.max(0, totalGzip - BUDGETS.maxTotalJsCssGzip),
  withinBudget: failures.length === 0,
  assetCount: files.length,
  javascriptAssetCount: js.length,
  cssAssetCount: css.length,
  publicPassthroughAssetCount: publicPassthrough.length,
  publicPassthroughGzipBytes: passthroughGzip,
  assets: [...files]
    .sort((a, b) => b.gzip - a.gzip)
    .map((file) => ({
      path: file.name,
      type: file.type,
      rawBytes: file.raw,
      gzipBytes: file.gzip,
    })),
  failures,
};
writeReport(report);

const diagnosticSummary = [
  `root=${assetRoot}`,
  `generated=${files.length}`,
  `passthrough=${publicPassthrough.length}`,
  `passthrough_gzip=${kb(passthroughGzip)} KiB`,
  `javascript_gzip=${kb(javascriptGzipBytes)} KiB`,
  `css_gzip=${kb(cssGzipBytes)} KiB`,
  `largest_js_raw=${largestJsRaw?.name ?? "n/a"}:${kb(largestJsRaw?.raw ?? 0)} KiB`,
  `largest_js_gzip=${largestJsGzip?.name ?? "n/a"}:${kb(largestJsGzip?.gzip ?? 0)} KiB`,
  `largest_css_gzip=${largestCssGzip?.name ?? "n/a"}:${kb(largestCssGzip?.gzip ?? 0)} KiB`,
  `total_gzip=${kb(totalGzip)} KiB`,
  `app_shell_gzip=${appShell.length ? `${kb(appShellGzip)} KiB` : "n/a"}`,
  `global_styles_gzip=${globalStyles.length ? `${kb(globalStylesGzip)} KiB` : "n/a"}`,
  `report=${REPORT_PATH}`,
].join("; ");

console.log("Solaris Studio client performance budget");
console.log(`  generated assets: ${files.length} from ${assetRoot}`);
if (publicPassthrough.length) {
  console.log(
    `  public passthrough assets: ${publicPassthrough.length} excluded · ${kb(passthroughGzip)} KiB gzip`,
  );
}
console.log(`  JavaScript gzip: ${javascriptGzipBytes} bytes · ${kb(javascriptGzipBytes)} KiB`);
console.log(`  CSS gzip: ${cssGzipBytes} bytes · ${kb(cssGzipBytes)} KiB`);
console.log(
  `  largest JS raw: ${largestJsRaw?.name ?? "n/a"} · ${kb(largestJsRaw?.raw ?? 0)} KiB`,
);
console.log(
  `  largest JS gzip: ${largestJsGzip?.name ?? "n/a"} · ${kb(largestJsGzip?.gzip ?? 0)} KiB`,
);
console.log(
  `  largest CSS gzip: ${largestCssGzip?.name ?? "n/a"} · ${kb(largestCssGzip?.gzip ?? 0)} KiB`,
);
console.log(
  `  total JS + CSS gzip: ${totalGzip} bytes · ${kb(totalGzip)} KiB / ${BUDGETS.maxTotalJsCssGzip} bytes`,
);
console.log(`  machine-readable report: ${REPORT_PATH}`);
if (appShell.length) console.log(`  app shell CSS gzip: ${kb(appShellGzip)} KiB`);
if (globalStyles.length) console.log(`  global styles CSS gzip: ${kb(globalStylesGzip)} KiB`);

if (failures.length) {
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
