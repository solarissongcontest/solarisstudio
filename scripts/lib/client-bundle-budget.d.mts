export type ClientBundleBudget = Readonly<{
  maxSingleJsRaw: number;
  maxSingleJsGzip: number;
  maxSingleCssGzip: number;
  maxTotalJsCssGzip: number;
  maxAppShellCssGzip: number;
  maxGlobalStylesCssGzip: number;
}>;

export type ClientBundleAssetMeasurement = Readonly<{
  name: string;
  rawBytes: number;
  gzipBytes: number;
}>;

export type ClientBundleBudgetFailure = Readonly<{
  code:
    | "single-js-raw"
    | "single-js-gzip"
    | "single-css-gzip"
    | "app-shell-css-gzip"
    | "global-styles-css-gzip"
    | "total-js-css-gzip";
  asset: string | null;
  actual: number;
  limit: number;
  message: string;
}>;

export const CLIENT_BUNDLE_BUDGET: ClientBundleBudget;
export function isRelevantClientAsset(name: string): boolean;
export function evaluateClientBundleBudget(
  assets: readonly ClientBundleAssetMeasurement[],
  budget?: ClientBundleBudget,
): {
  relevantAssets: ClientBundleAssetMeasurement[];
  totalGzip: number;
  failures: ClientBundleBudgetFailure[];
};
