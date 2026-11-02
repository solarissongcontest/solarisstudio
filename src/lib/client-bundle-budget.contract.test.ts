import { describe, expect, it } from "vitest";

import {
  CLIENT_BUNDLE_BUDGET,
  evaluateClientBundleBudget,
} from "../../scripts/lib/client-bundle-budget.mjs";

const asset = (name: string, gzipBytes: number, rawBytes = gzipBytes * 2) => ({
  name,
  gzipBytes,
  rawBytes,
});

const distributedJsAssets = (totalGzip: number) => {
  const count = 7;
  const base = Math.floor(totalGzip / count);
  const remainder = totalGzip % count;
  return Array.from({ length: count }, (_, index) => {
    const gzipBytes = base + (index < remainder ? 1 : 0);
    return asset(`chunk-${index}.js`, gzipBytes, gzipBytes * 2);
  });
};

const failureCodes = (assets: ReturnType<typeof asset>[]) =>
  evaluateClientBundleBudget(assets).failures.map(({ code }) => code);

describe("client bundle budget policy", () => {
  it("exports one immutable canonical policy", () => {
    expect(Object.isFrozen(CLIENT_BUNDLE_BUDGET)).toBe(true);
  });

  it("passes measurements below every limit", () => {
    expect(
      evaluateClientBundleBudget([
        asset("route.js", 120 * 1024, 400 * 1024),
        asset("route.css", 20 * 1024, 80 * 1024),
      ]).failures,
    ).toEqual([]);
  });

  it("passes exactly at the aggregate limit", () => {
    const result = evaluateClientBundleBudget(
      distributedJsAssets(CLIENT_BUNDLE_BUDGET.maxTotalJsCssGzip),
    );

    expect(result.totalGzip).toBe(CLIENT_BUNDLE_BUDGET.maxTotalJsCssGzip);
    expect(result.failures).toEqual([]);
  });

  it("fails one byte over the aggregate limit", () => {
    const actual = CLIENT_BUNDLE_BUDGET.maxTotalJsCssGzip + 1;
    const result = evaluateClientBundleBudget(distributedJsAssets(actual));
    const totalFailure = result.failures.find(
      ({ code }) => code === "total-js-css-gzip",
    );

    expect(totalFailure).toMatchObject({
      actual,
      limit: CLIENT_BUNDLE_BUDGET.maxTotalJsCssGzip,
    });
  });

  it("fails the single JavaScript raw limit", () => {
    expect(
      failureCodes([
        asset("route.js", 1, CLIENT_BUNDLE_BUDGET.maxSingleJsRaw + 1),
      ]),
    ).toContain("single-js-raw");
  });

  it("fails the single JavaScript gzip limit", () => {
    expect(
      failureCodes([
        asset(
          "route.js",
          CLIENT_BUNDLE_BUDGET.maxSingleJsGzip + 1,
          CLIENT_BUNDLE_BUDGET.maxSingleJsRaw,
        ),
      ]),
    ).toContain("single-js-gzip");
  });

  it("fails the single CSS gzip limit", () => {
    expect(
      failureCodes([
        asset("route.css", CLIENT_BUNDLE_BUDGET.maxSingleCssGzip + 1),
      ]),
    ).toContain("single-css-gzip");
  });

  it("fails the app-shell CSS sub-budget", () => {
    expect(
      failureCodes([
        asset(
          "app-shell-abc.css",
          CLIENT_BUNDLE_BUDGET.maxAppShellCssGzip + 1,
        ),
      ]),
    ).toContain("app-shell-css-gzip");
  });

  it("fails the global styles CSS sub-budget", () => {
    expect(
      failureCodes([
        asset(
          "index-abc.css",
          CLIENT_BUNDLE_BUDGET.maxGlobalStylesCssGzip + 1,
        ),
      ]),
    ).toContain("global-styles-css-gzip");
  });

  it("includes JavaScript and CSS assets in aggregate measurement", () => {
    const result = evaluateClientBundleBudget([
      asset("route.js", 11),
      asset("route.css", 13),
    ]);

    expect(result.relevantAssets.map(({ name }) => name)).toEqual([
      "route.js",
      "route.css",
    ]);
    expect(result.totalGzip).toBe(24);
  });

  it("excludes maps, images, fonts and unrelated files", () => {
    const result = evaluateClientBundleBudget([
      asset("route.js", 11),
      asset("route.js.map", 10_000_000),
      asset("hero.webp", 10_000_000),
      asset("font.woff2", 10_000_000),
      asset("manifest.json", 10_000_000),
    ]);

    expect(result.relevantAssets.map(({ name }) => name)).toEqual(["route.js"]);
    expect(result.totalGzip).toBe(11);
    expect(result.failures).toEqual([]);
  });
});
