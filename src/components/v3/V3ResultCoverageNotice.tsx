import type { PublicResultCoverage } from "@/lib/v3-public-result-snapshots";

/** Public availability only. Missing history must not silently become an
 * all-time total; no implementation/version details or private state are shown. */
export function V3ResultCoverageNotice({ coverage }: { coverage?: PublicResultCoverage }) {
  if (!coverage || coverage.unavailableShows === 0) return null;
  return (
    <p role="status" data-v3-result-coverage="partial" className="mx-auto mb-4 max-w-5xl rounded-xl border border-white/10 px-4 py-3 text-sm text-white/60">
      Some public results are not available in this view yet. Comparisons and records cover the available results.
    </p>
  );
}
