import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = () =>
  readFileSync(resolve(process.cwd(), "src/components/v3/V3RecordsGate.tsx"), "utf8");

describe("Public V3 Records publication-read recovery", () => {
  it("shows a spoiler-safe unavailable surface instead of mounting an archive fallback", () => {
    const gate = source();
    expect(gate).toContain(
      "const unavailable = bundle.isError || !bundle.data || rollout.isError || !rollout.data",
    );
    expect(gate).toContain("if (loading || unavailable)");
    expect(gate).toContain("data-v3-records-authority-unavailable={!loading");
    expect(gate).toContain("Records remain hidden until the public service can be reached");
    expect(gate.indexOf("if (loading || unavailable)")).toBeLessThan(
      gate.indexOf("if (rollout.data.enabled !== true || rollout.data.resultsEnabled !== true)"),
    );
    expect(gate.match(/return <>{fallback}<\/>;/g)?.length).toBe(1);
  });

  it("offers only a bounded, disabled-while-fetching authoritative retry", () => {
    const gate = source();
    expect(gate).toContain("const retrying = bundle.isFetching || rollout.isFetching");
    expect(gate).toContain("disabled={retrying}");
    expect(gate).toContain("if (bundle.isError || !bundle.data) void bundle.refetch()");
    expect(gate).toContain("else void rollout.refetch()");
    expect(gate).toContain("Retry official records");
    expect(gate).not.toContain("setInterval(");
    expect(gate).not.toContain("useAllResults");
    expect(gate).not.toContain("useAllJuryVotes");
  });

  it("preserves rollout-off fallback and already established spoiler-safe records", () => {
    const gate = source();
    expect(gate).toContain("rollout.data.resultsEnabled !== true");
    expect(gate).toContain("resolveV3ResultsSpoilerProtection({");
    expect(gate).toContain("bundle.data.spoilerSafeRecords");
    expect(gate).toContain("bundle.data.spoilerSafeArchivedFinalEditions");
    expect(gate).toContain("setCurrentEditionRevealed(false)");
    expect(gate).toContain("setCurrentEditionRevealed(true)");
  });
});
