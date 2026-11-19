import { describe, expect, it } from "vitest";

import { refreshPublicRuleRecentLabels } from "./public-rule-recent-labels";

const recent = (path: string, label: string) => ({ path, label, visitedAt: 100 });

describe("global Search rule recents", () => {
  it("replaces old stored chapter names with the canonical chapter title", () => {
    expect(refreshPublicRuleRecentLabels([
      recent("/rules/chapters/nature-purpose-status", "Outdated chapter title"),
      recent("/rules/chapters", "An old directory name"),
    ]).map((item) => item.label)).toEqual([
      "Chapter 1: Nature, Purpose & Status",
      "Rulebook Chapters",
    ]);
  });

  it("uses the current governed rule release, never a stale localStorage rule title", () => {
    const release = {
      version: "4.2",
      title: "General Regulations",
      summary: "",
      changes: [{
        rule_id: "1.1",
        change_kind: "modified" as const,
        before_snapshot: null,
        after_snapshot: { title: "What SSC is" },
        rationale: "Published clarity update",
      }],
    };
    const updated = refreshPublicRuleRecentLabels([
      recent("/rules/1.1", "Old text from another release"),
      recent("/countries/oland", "Oland"),
    ], release);
    expect(updated).toEqual([
      recent("/rules/1.1", "1.1 What SSC is"),
      recent("/countries/oland", "Oland"),
    ]);
  });

  it("fails closed on removed unknown rule and chapter destinations", () => {
    expect(refreshPublicRuleRecentLabels([
      recent("/rules/999.99", "Invented regulation"),
      recent("/rules/chapters/old-removed-section", "Old section"),
      recent("/rules/22.5", "Old Rule 22.5"),
    ]).map((item) => item.path)).toEqual(["/rules/22.5"]);
  });
});
