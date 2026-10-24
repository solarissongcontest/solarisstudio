import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const ROOTS = [
  ".output/public/assets",
  "dist/client/assets",
  "dist/assets",
];

const assetRoot = ROOTS.find((root) => existsSync(root));
if (!assetRoot) {
  console.error(
    "Solaris client budget: no production asset directory found. Run the production build first.",
  );
  process.exit(1);
}

// These are release budgets. Changes to the limits must be explicit and
// reviewed so CI continues to catch accidental client-size regressions.
const BUDGETS = {
  maxSingleJsRaw: 1_050 * 1024,
  maxSingleJsGzip: 300 * 1024,
  maxSingleCssGzip: 45 * 1024,
  maxTotalJsCssGzip: 1_900 * 1024,
  maxAppShellCssGzip: 15 * 1024,
  maxGlobalStylesCssGzip: 48 * 1024,
};

const reportDir = process.env.CLIENT_BUNDLE_REPORT_DIR || "artifacts/client-bundle";
const attributionPath = join(reportDir, "build-attribution.json");
let attribution = null;
if (existsSync(attributionPath)) {
  try {
    attribution = JSON.parse(readFileSync(attributionPath, "utf8"));
  } catch (error) {
    console.warn(
      `Solaris client budget: could not parse ${attributionPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

const files = readdirSync(assetRoot)
  .filter((name) => /\.(?:js|css)$/.test(name))
  .map((name) => {
    const bytes = readFileSync(join(assetRoot, name));
    return {
      name,
      type: name.endsWith(".js") ? "js" : "css",
      raw: bytes.byteLength,
      gzip: gzipSync(bytes, { level: 9 }).byteLength,
    };
  });

if (!files.length) {
  console.error(`Solaris client budget: no JS/CSS assets found in ${assetRoot}.`);
  process.exit(1);
}

const js = files.filter((file) => file.type === "js");
const css = files.filter((file) => file.type === "css");
const largestJsRaw = [...js].sort((a, b) => b.raw - a.raw)[0];
const largestJsGzip = [...js].sort((a, b) => b.gzip - a.gzip)[0];
const largestCssGzip = [...css].sort((a, b) => b.gzip - a.gzip)[0];
const totalGzip = files.reduce((sum, file) => sum + file.gzip, 0);
const appShell = css.find((file) => /^app-shell-.*\.css$/.test(file.name));
const globalStyles = css.find((file) => /^styles-.*\.css$/.test(file.name));
const largestAssets = [...files]
  .sort((a, b) => b.gzip - a.gzip || b.raw - a.raw)
  .slice(0, 20);

const kb = (bytes) => (bytes / 1024).toFixed(1);
const signedKb = (bytes) => `${bytes > 0 ? "+" : ""}${kb(bytes)} KiB`;
const failures = [];

function enforce(key, label, actual, limit, file) {
  const passed = actual <= limit;
  if (!passed) {
    failures.push({
      key,
      label,
      actual,
      limit,
      delta: actual - limit,
      file: file ?? null,
    });
  }
  return {
    key,
    label,
    actual,
    limit,
    delta: actual - limit,
    passed,
    file: file ?? null,
  };
}

const checks = [
  enforce(
    "maxSingleJsRaw",
    "Largest JS raw",
    largestJsRaw?.raw ?? 0,
    BUDGETS.maxSingleJsRaw,
    largestJsRaw?.name,
  ),
  enforce(
    "maxSingleJsGzip",
    "Largest JS gzip",
    largestJsGzip?.gzip ?? 0,
    BUDGETS.maxSingleJsGzip,
    largestJsGzip?.name,
  ),
  enforce(
    "maxSingleCssGzip",
    "Largest CSS gzip",
    largestCssGzip?.gzip ?? 0,
    BUDGETS.maxSingleCssGzip,
    largestCssGzip?.name,
  ),
  enforce(
    "maxTotalJsCssGzip",
    "Total JS + CSS gzip",
    totalGzip,
    BUDGETS.maxTotalJsCssGzip,
  ),
];

if (appShell) {
  checks.push(
    enforce(
      "maxAppShellCssGzip",
      "App shell CSS gzip",
      appShell.gzip,
      BUDGETS.maxAppShellCssGzip,
      appShell.name,
    ),
  );
}
if (globalStyles) {
  checks.push(
    enforce(
      "maxGlobalStylesCssGzip",
      "Global styles CSS gzip",
      globalStyles.gzip,
      BUDGETS.maxGlobalStylesCssGzip,
      globalStyles.name,
    ),
  );
}

const report = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  assetRoot,
  assetCount: files.length,
  budgets: BUDGETS,
  actual: {
    totalJsCssGzip: totalGzip,
    largestJsRaw: largestJsRaw ?? null,
    largestJsGzip: largestJsGzip ?? null,
    largestCssGzip: largestCssGzip ?? null,
    appShellCssGzip: appShell ?? null,
    globalStylesCssGzip: globalStyles ?? null,
  },
  checks,
  failures,
  passed: failures.length === 0,
  largestAssets,
  attribution,
};

mkdirSync(reportDir, { recursive: true });
writeFileSync(
  join(reportDir, "budget-report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);

const moduleRows = Array.isArray(attribution?.topInitialModules)
  ? attribution.topInitialModules.slice(0, 20)
  : [];
const packageRows = Array.isArray(attribution?.topInitialPackages)
  ? attribution.topInitialPackages.slice(0, 20)
  : [];
const serverOnlyCandidates = Array.isArray(attribution?.serverOnlyCandidatesInInitialGraph)
  ? attribution.serverOnlyCandidatesInInitialGraph
  : [];

const markdown = [
  "## Solaris Studio client performance budget",
  "",
  `- Result: **${report.passed ? "PASS" : "FAIL"}**`,
  `- Asset root: \`${assetRoot}\``,
  `- JS/CSS assets: ${files.length}`,
  `- Module attribution: **${attribution ? "available" : "unavailable"}**`,
  "",
  "### Budget checks",
  "",
  "| Metric | Actual | Budget | Delta | Result | Asset |",
  "| --- | ---: | ---: | ---: | :---: | --- |",
  ...checks.map(
    (check) =>
      `| ${check.label} | ${kb(check.actual)} KiB | ${kb(check.limit)} KiB | ${signedKb(check.delta)} | ${check.passed ? "PASS" : "FAIL"} | ${check.file ? `\`${check.file}\`` : "—"} |`,
  ),
  "",
  "### 20 largest emitted JS/CSS assets by gzip size",
  "",
  "| # | Asset | Type | Raw | Gzip |",
  "| ---: | --- | :---: | ---: | ---: |",
  ...largestAssets.map(
    (file, index) =>
      `| ${index + 1} | \`${file.name}\` | ${file.type} | ${kb(file.raw)} KiB | ${kb(file.gzip)} KiB |`,
  ),
  ...(moduleRows.length
    ? [
        "",
        "### 20 largest modules in the initial browser graph",
        "",
        "| # | Module | Package | Rendered | Initial chunk(s) |",
        "| ---: | --- | --- | ---: | --- |",
        ...moduleRows.map(
          (row, index) =>
            `| ${index + 1} | \`${String(row.module).replaceAll("|", "\\|")}\` | ${row.package ? `\`${row.package}\`` : "app"} | ${kb(row.renderedBytes ?? 0)} KiB | ${(row.chunks ?? []).map((chunk) => `\`${chunk}\``).join(", ")} |`,
        ),
      ]
    : []),
  ...(packageRows.length
    ? [
        "",
        "### Largest packages in the initial browser graph",
        "",
        "| # | Package | Rendered |",
        "| ---: | --- | ---: |",
        ...packageRows.map(
          (row, index) => `| ${index + 1} | \`${row.name}\` | ${kb(row.renderedBytes ?? 0)} KiB |`,
        ),
      ]
    : []),
  "",
  `### Server-only-looking modules in the initial browser graph: ${serverOnlyCandidates.length}`,
  "",
  ...(serverOnlyCandidates.length
    ? serverOnlyCandidates.map(
        (row) => `- \`${row.module}\` · ${kb(row.renderedBytes ?? 0)} KiB · ${(row.chunks ?? []).join(", ")}`,
      )
    : ["None detected by the conservative path heuristic."]),
  "",
].join("\n");
writeFileSync(join(reportDir, "budget-report.md"), `${markdown}\n`, "utf8");

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`, "utf8");
}

console.log("Solaris Studio client performance budget");
console.log(`  assets: ${files.length} from ${assetRoot}`);
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
console.log(`  module attribution: ${attribution ? "available" : "unavailable"}`);
console.log(`  report: ${join(reportDir, "budget-report.md")}`);
console.log("\n20 largest emitted assets by gzip size:");
for (const [index, file] of largestAssets.entries()) {
  console.log(
    `  ${String(index + 1).padStart(2, " ")}. ${file.name} · raw ${kb(file.raw)} KiB · gzip ${kb(file.gzip)} KiB`,
  );
}

if (moduleRows.length) {
  console.log("\n20 largest modules in the initial browser graph:");
  for (const [index, row] of moduleRows.entries()) {
    console.log(
      `  ${String(index + 1).padStart(2, " ")}. ${row.module} · ${kb(row.renderedBytes ?? 0)} KiB · ${(row.chunks ?? []).join(", ")}`,
    );
  }
}

if (failures.length) {
  console.error("\nClient performance budget exceeded:");
  for (const failure of failures) {
    console.error(
      `  - ${failure.label}: ${kb(failure.actual)} KiB > ${kb(failure.limit)} KiB (${signedKb(failure.delta)})${failure.file ? ` (${failure.file})` : ""}`,
    );
  }
  process.exit(1);
}

console.log("Client performance budget passed.");
