const KiB = 1024;

/**
 * Canonical Solaris client bundle policy.
 *
 * The aggregate limit is intentionally 1.8 MiB. PR #1801 temporarily raised
 * enforcement to 2.2 MiB to unblock an already-over-budget production bundle;
 * that release headroom was not a new performance target. Changes to these
 * limits require deliberate performance-policy review and measured build
 * evidence, not a test-only edit.
 */
export const CLIENT_BUNDLE_BUDGET = Object.freeze({
  maxSingleJsRaw: 1_050 * KiB,
  maxSingleJsGzip: 300 * KiB,
  maxSingleCssGzip: 45 * KiB,
  maxTotalJsCssGzip: 1_800 * KiB,
  maxAppShellCssGzip: 30 * KiB,
  maxGlobalStylesCssGzip: 30 * KiB,
});

export const isRelevantClientAsset = (name) =>
  name.endsWith(".js") || name.endsWith(".css");

const formatKiB = (bytes) => `${(bytes / KiB).toFixed(1)} KiB`;

const failure = (code, actual, limit, message, asset = null) => ({
  code,
  asset,
  actual,
  limit,
  message,
});

/**
 * Evaluate already-measured build assets against the canonical policy.
 * Filesystem traversal and gzip measurement deliberately live outside this
 * function so boundary behavior can be tested without freezing source text.
 */
export function evaluateClientBundleBudget(
  assets,
  budget = CLIENT_BUNDLE_BUDGET,
) {
  const relevantAssets = assets.filter(({ name }) => isRelevantClientAsset(name));
  const failures = [];
  let totalGzip = 0;

  for (const asset of relevantAssets) {
    const { name, rawBytes, gzipBytes } = asset;
    totalGzip += gzipBytes;

    if (name.endsWith(".js")) {
      if (rawBytes > budget.maxSingleJsRaw) {
        failures.push(
          failure(
            "single-js-raw",
            rawBytes,
            budget.maxSingleJsRaw,
            `${name}: raw ${formatKiB(rawBytes)} > ${formatKiB(budget.maxSingleJsRaw)}`,
            name,
          ),
        );
      }
      if (gzipBytes > budget.maxSingleJsGzip) {
        failures.push(
          failure(
            "single-js-gzip",
            gzipBytes,
            budget.maxSingleJsGzip,
            `${name}: gzip ${formatKiB(gzipBytes)} > ${formatKiB(budget.maxSingleJsGzip)}`,
            name,
          ),
        );
      }
      continue;
    }

    if (gzipBytes > budget.maxSingleCssGzip) {
      failures.push(
        failure(
          "single-css-gzip",
          gzipBytes,
          budget.maxSingleCssGzip,
          `${name}: gzip ${formatKiB(gzipBytes)} > ${formatKiB(budget.maxSingleCssGzip)}`,
          name,
        ),
      );
    }

    if (name.startsWith("app-shell-") && gzipBytes > budget.maxAppShellCssGzip) {
      failures.push(
        failure(
          "app-shell-css-gzip",
          gzipBytes,
          budget.maxAppShellCssGzip,
          `${name}: gzip ${formatKiB(gzipBytes)} > ${formatKiB(budget.maxAppShellCssGzip)}`,
          name,
        ),
      );
    }

    if (name.startsWith("index-") && gzipBytes > budget.maxGlobalStylesCssGzip) {
      failures.push(
        failure(
          "global-styles-css-gzip",
          gzipBytes,
          budget.maxGlobalStylesCssGzip,
          `${name}: gzip ${formatKiB(gzipBytes)} > ${formatKiB(budget.maxGlobalStylesCssGzip)}`,
          name,
        ),
      );
    }
  }

  if (totalGzip > budget.maxTotalJsCssGzip) {
    failures.push(
      failure(
        "total-js-css-gzip",
        totalGzip,
        budget.maxTotalJsCssGzip,
        `total JS+CSS gzip ${formatKiB(totalGzip)} > ${formatKiB(budget.maxTotalJsCssGzip)}`,
      ),
    );
  }

  return { relevantAssets, totalGzip, failures };
}
