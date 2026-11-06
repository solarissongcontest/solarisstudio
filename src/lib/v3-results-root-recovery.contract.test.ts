import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const gate = () =>
  readFileSync(
    resolve(process.cwd(), "src/components/v3/V3ResultsRootGate.tsx"),
    "utf8",
  );

describe("Public Results root authoritative recovery boundary", () => {
  it("does not mount the old result readers when snapshot or rollout verification fails", () => {
    const source = gate();
    const unreadable = source.indexOf(
      "if (bundle.isError || !bundle.data || rollout.isError || !rollout.data)",
    );
    const disabled = source.indexOf("if (!v3Enabled) return <>{fallback}</>");

    expect(unreadable).toBeGreaterThan(-1);
    expect(disabled).toBeGreaterThan(unreadable);
    expect(source).toContain('data-v3-results-authority-unavailable=""');
    expect(source).toContain("No outcome");
    expect(source).toContain("is shown until the authoritative Results service");
    expect(source).not.toContain(
      "if (bundle.isError || !bundle.data || rollout.isError || !rollout.data) {\n    return <>{fallback}</>",
    );
    expect(source.match(/return <>{fallback}<\/>;/g)?.length).toBe(1);
  });

  it("provides one bounded user-controlled retry for the actual failing request", () => {
    const source = gate();
    expect(source).toContain("const retrying = bundle.isFetching || rollout.isFetching");
    expect(source).toContain("disabled={retrying}");
    expect(source).toContain("if (bundle.isError || !bundle.data) void bundle.refetch()");
    expect(source).toContain("else void rollout.refetch()");
    expect(source).toContain("Retry official results");
    expect(source).toContain("motion-safe:animate-spin");
    expect(source).not.toContain("setInterval(");
  });

  it("retains explicit rollout-off fallback and the established viewer-bound spoiler policy", () => {
    const source = gate();
    expect(source).toContain(
      "rollout.data.enabled === true && rollout.data.resultsEnabled === true",
    );
    expect(source).toContain("if (!v3Enabled) return <>{fallback}</>");
    expect(source).toContain("resolveV3ResultsSpoilerProtection({");
    expect(source).toContain("countryAccount.data?.access.userId === rollout.data.userId");
    expect(source).toContain("onResultChange={setSelectedShowId}");
  });
});
