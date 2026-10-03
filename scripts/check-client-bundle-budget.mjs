import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const ROOTS = [
  ".output/public/_build/assets",
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

const BUDGETS = {
  maxSingleJsRaw: 1_050 * 1024,
  maxSingleJsGzip: 300 * 1024,
  maxSingleCssGzip: 45 * 1024,
  maxTotalJsCssGzip: 1_800 * 1024,
  maxAppShellCssGzip: 15 * 1024,
  maxGlobalStylesCssGzip: 48 * 1024,
};

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

const kb = (bytes) => (bytes / 1024).toFixed(1);
const failures = [];

function enforce(label, actual, limit, file) {
  if (actual <= limit) return;
  failures.push(
    `${label}: ${kb(actual)} KiB > ${kb(limit)} KiB${file ? ` (${file})` : ""}`,
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

if (failures.length) {
  console.error("\nClient performance budget exceeded:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log("Client performance budget passed.");
