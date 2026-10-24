import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assessV3PrMainFreshness,
  isV3PullForFreshness,
} from "../check-v3-pr-main-freshness";

const MAIN = "1111111111111111111111111111111111111111";
const HEAD = "2222222222222222222222222222222222222222";
const workflow = readFileSync(
  ".github/workflows/v3-pr-main-freshness.yml",
  "utf8",
);
const checker = readFileSync("scripts/check-v3-pr-main-freshness.ts", "utf8");

describe("V3 PR current-main freshness guard", () => {
  it("accepts an exact PR head that contains literal current main", () => {
    const result = assessV3PrMainFreshness({
      baseRef: "main",
      currentMainSha: MAIN,
      prHeadSha: HEAD,
      compareStatus: "ahead",
      mergeBaseSha: MAIN,
      expectedEventHeadSha: HEAD,
      finalMainSha: MAIN,
      finalPrHeadSha: HEAD,
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
      finalMainSha: MAIN,
      finalPrHeadSha: MAIN,
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
      finalMainSha: MAIN,
      finalPrHeadSha: HEAD,
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
      finalMainSha: MAIN,
      finalPrHeadSha: HEAD,
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "pull-request head moved after this workflow event; rerun on the current exact head",
    );
  });

  it("rejects main or head movement during the live ancestry check", () => {
    const result = assessV3PrMainFreshness({
      baseRef: "main",
      currentMainSha: MAIN,
      prHeadSha: HEAD,
      compareStatus: "ahead",
      mergeBaseSha: MAIN,
      expectedEventHeadSha: HEAD,
      finalMainSha: "3333333333333333333333333333333333333333",
      finalPrHeadSha: "4444444444444444444444444444444444444444",
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "current main moved during the freshness check; rerun before integration",
    );
    expect(result.errors).toContain(
      "pull-request head moved during the freshness check; rerun on the new exact head",
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
      finalMainSha: "final-main",
      finalPrHeadSha: "final-head",
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        "current main SHA is not an exact 40-character SHA",
        "pull-request head SHA is not an exact 40-character SHA",
        "compare merge-base SHA is not an exact 40-character SHA",
        "workflow event head SHA is not an exact 40-character SHA",
        "final current-main SHA is not an exact 40-character SHA",
        "final pull-request head SHA is not an exact 40-character SHA",
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
      finalMainSha: MAIN,
      finalPrHeadSha: HEAD,
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "V3 integration freshness applies only to main-based PRs; received release-candidate",
    );
  });

  it("selects V3 main PRs for freshness by branch or title", () => {
    expect(
      isV3PullForFreshness({
        title: "A normal title",
        base: { ref: "main" },
        head: { ref: "v3/public-example", sha: HEAD },
      }),
    ).toBe(true);
    expect(
      isV3PullForFreshness({
        title: "[V3-QA] Example",
        base: { ref: "main" },
        head: { ref: "qa/example", sha: HEAD },
      }),
    ).toBe(true);
  });

  it("does not select unrelated or non-main PRs", () => {
    expect(
      isV3PullForFreshness({
        title: "ordinary change",
        base: { ref: "main" },
        head: { ref: "feature/example", sha: HEAD },
      }),
    ).toBe(false);
    expect(
      isV3PullForFreshness({
        title: "[V3-QA] stacked child",
        base: { ref: "v3/parent" },
        head: { ref: "v3/child", sha: HEAD },
      }),
    ).toBe(false);
  });

  it("keeps automatic and requested integration identities separate", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("workflow_call:");
    expect(workflow).toContain("if: inputs.pr_number == 0");
    expect(workflow).toContain("if: inputs.pr_number != 0");
    expect(workflow).toContain(
      "V3_EXPECTED_HEAD_SHA: ${{ github.event.pull_request.head.sha }}",
    );
    expect(workflow).toContain("V3_CURRENT_PR: ${{ inputs.pr_number }}");
    expect(workflow).toContain(
      "ref: ${{ inputs.pr_number == 0 && github.event.pull_request.head.sha || 'main' }}",
    );
  });

  it("keeps the freshness gate bounded, read-only and production-isolated", () => {
    expect(workflow).not.toContain("\n  push:");
    expect(workflow).not.toContain("statuses: write");
    expect(checker).not.toContain("/pulls?");
    expect(checker).not.toContain("state=open");
    expect(checker).not.toContain("supabase.co");
    expect(workflow).not.toContain("supabase.co");
    expect(workflow).toContain(
      "It does not enumerate all open PRs, write GitHub state, start Supabase",
    );
  });
});
