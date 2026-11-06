import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const gate = () =>
  readFileSync(
    resolve(process.cwd(), "src/components/v3/V3RelationshipsGate.tsx"),
    "utf8",
  );

describe("Public Relationships read recovery", () => {
  it("keeps index and pair detail hidden when either authoritative read fails", () => {
    const source = gate();
    expect(
      source.match(
        /const unavailable = bundle.isError \|\| !bundle.data \|\| rollout.isError \|\| !rollout.data/g,
      ),
    ).toHaveLength(2);
    expect(source.match(/if \(loading \|\| unavailable(?: \|\| !bundle\.data \|\| !rollout\.data)?\)/g)).toHaveLength(2);
    expect(source).toContain("data-v3-relationships-authority-unavailable={unavailable ?");
    expect(source).toContain("No analysis is shown until the official service is reachable");
    expect(source.match(/return <>{fallback}<\/>;/g)).toHaveLength(2);
  });

  it("offers an accessible bounded retry without introducing broad legacy reads", () => {
    const source = gate();
    expect(source).toContain('type="button"');
    expect(source).toContain("disabled={retrying}");
    expect(source).toContain("Retry published relationships");
    expect(source).toContain("Retrying relationships…");
    expect(source.match(/if \(bundle.isError \|\| !bundle.data\) void bundle.refetch\(\)/g)).toHaveLength(2);
    expect(source.match(/else void rollout.refetch\(\)/g)).toHaveLength(2);
    expect(source).not.toContain("setInterval(");
    expect(source).not.toContain("useAllResults");
    expect(source).not.toContain("useAllJuryVotes");
  });

  it("treats a successful unknown pair as a safe not-found, not a retryable outage", () => {
    const source = gate();
    const detailStart = source.indexOf("export function V3RelationshipDetailGate(");
    const detail = source.slice(detailStart);
    expect(detail).toContain("if (bundle.isSuccess && bundle.data === null)");
    expect(detail.indexOf("if (bundle.isSuccess && bundle.data === null)")).toBeLessThan(
      detail.indexOf("if (loading || unavailable || !bundle.data || !rollout.data)"),
    );
    expect(detail).toContain("<V3RelationshipsLoading notFound />");
    expect(source).toContain("No published relationship matches this country pair");
    expect(source).toContain('href="/relationships"');
    expect(source).toContain("Browse voting relationships");
  });

  it("preserves server-owned rollout-off fallback and publication-aware screens", () => {
    const source = gate();
    expect(source).toContain("useV3EditionRolloutProbe");
    expect(source).toContain("useV3RolloutProbe");
    expect(
      source.match(
        /if \(rollout.data.enabled !== true \|\| rollout.data.resultsEnabled !== true\)/g,
      ),
    ).toHaveLength(2);
    expect(source).toContain("<V3RelationshipsIndexScreen pairs={bundle.data.pairs} />");
    expect(source).toContain("<V3RelationshipDetailScreen bundle={bundle.data} />");
  });
});
