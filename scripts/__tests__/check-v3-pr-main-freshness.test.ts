import { describe, expect, it } from "vitest";
import { assessV3PrMainFreshness } from "../check-v3-pr-main-freshness";

const MAIN = "1111111111111111111111111111111111111111";
const HEAD = "2222222222222222222222222222222222222222";

describe("V3 PR current-main freshness guard", () => {
  it("accepts an exact PR head that contains literal current main", () => {
    const result = assessV3PrMainFreshness({
      baseRef: "main",
      currentMainSha: MAIN,
      prHeadSha: HEAD,
      compareStatus: "ahead",
      mergeBaseSha: MAIN,
      expectedEventHeadSha: HEAD,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("accepts the degenerate identical case", () => {
    const result = assessV3PrMainFreshness({
      baseRef: "main",
      currentMainSha: MAIN,
      prHeadSha: MAIN,
      compareStatus: "identical",
      mergeBaseSha: MAIN,
      expectedEventHeadSha: MAIN,
    });
    expect(result.valid).toBe(true);
  });

  it("rejects a stale head after main has moved", () => {
    const result = assessV3PrMainFreshness({
      baseRef: "main",
      currentMainSha: MAIN,
      prHeadSha: HEAD,
      compareStatus: "diverged",
      mergeBaseSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      expectedEventHeadSha: HEAD,
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "pull-request head does not contain current main (compare status: diverged)",
    );
    expect(result.errors).toContain(
      "current main is not the merge base of the pull-request head",
    );
  });

  it("rejects a workflow run whose PR head moved after the event", () => {
    const result = assessV3PrMainFreshness({
      baseRef: "main",
      currentMainSha: MAIN,
      prHeadSha: HEAD,
      compareStatus: "ahead",
      mergeBaseSha: MAIN,
      expectedEventHeadSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "pull-request head moved after this workflow event; rerun on the current exact head",
    );
  });

  it("fails closed on malformed identity fields", () => {
    const result = assessV3PrMainFreshness({
      baseRef: "main",
      currentMainSha: "main",
      prHeadSha: "head",
      compareStatus: "ahead",
      mergeBaseSha: "merge-base",
      expectedEventHeadSha: "event-head",
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        "current main SHA is not an exact 40-character SHA",
        "pull-request head SHA is not an exact 40-character SHA",
        "compare merge-base SHA is not an exact 40-character SHA",
        "workflow event head SHA is not an exact 40-character SHA",
      ]),
    );
  });

  it("does not silently apply the main integration rule to another base", () => {
    const result = assessV3PrMainFreshness({
      baseRef: "release-candidate",
      currentMainSha: MAIN,
      prHeadSha: HEAD,
      compareStatus: "ahead",
      mergeBaseSha: MAIN,
      expectedEventHeadSha: HEAD,
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "V3 integration freshness applies only to main-based PRs; received release-candidate",
    );
  });
});
