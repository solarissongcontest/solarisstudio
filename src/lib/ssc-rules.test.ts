import { describe, expect, it } from "vitest";

import {
  RULEBOOK_STATS,
  SSC_RULE_CHAPTERS,
  SSC_RULES,
  getRuleById,
  searchSscRules,
} from "./ssc-rules";

describe("SSC structured rulebook", () => {
  it("has unique rule ids and all fifteen chapters", () => {
    expect(RULEBOOK_STATS.chapters).toBe(15);
    expect(new Set(SSC_RULES.map((rule) => rule.id)).size).toBe(SSC_RULES.length);
    expect(SSC_RULE_CHAPTERS.map((chapter) => chapter.number)).toEqual(
      Array.from({ length: 15 }, (_, index) => index + 1),
    );
  });

  it("preserves core SSC artist reuse mechanics", () => {
    const rule = getRuleById("4.6");
    expect(rule).not.toBeNull();
    expect(rule?.summary).toMatch(/three/i);
    expect(rule?.body.join(" ")).toMatch(/permission/i);
    expect(rule?.important).toMatch(/winning artists may not compete again/i);
  });

  it("preserves the existing ten-level sanction scale", () => {
    const rule = getRuleById("11.2");
    expect(rule?.bullets).toHaveLength(10);
    expect(rule?.bullets?.[0]).toMatch(/Level 1.*Official Warning/i);
    expect(rule?.bullets?.[8]).toMatch(/Level 9.*One-Edition Ban/i);
    expect(rule?.bullets?.[9]).toMatch(/Level 10.*Lifetime Ban/i);
  });

  it("finds rules using participant vocabulary and synonyms", () => {
    expect(searchSscRules("friend voting").some((rule) => rule.id === "7.7")).toBe(true);
    expect(searchSscRules("esc artist").some((rule) => rule.id === "4.5")).toBe(true);
    expect(searchSscRules("anonymous report").some((rule) => rule.id === "14.8")).toBe(true);
    expect(searchSscRules("bug").some((rule) => rule.id === "14.4")).toBe(true);
  });

  it("states that automated integrity analysis is not a verdict", () => {
    const rule = getRuleById("7.8");
    expect(`${rule?.body.join(" ")} ${rule?.important}`).toMatch(/not proof|not independently/i);
  });
});
