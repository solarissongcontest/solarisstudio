import { describe, expect, it } from "vitest";

import {
  CLEAR_RULE_BODIES,
  PLAIN_SUMMARIES,
} from "@/lib/ssc-rules/plain-language-v42";
import { glossaryForRule } from "@/lib/ssc-rules/glossary";
import {
  SSC_RULEBOOK,
  SSC_RULES,
  getRuleById,
  searchSscRules,
} from "@/lib/ssc-rules-v4";

const bodyOf = (id: string) => {
  const rule = getRuleById(id);
  expect(rule, `Missing rule ${id}`).not.toBeNull();
  return rule!.body.join(" ");
};

describe("SSC v4.2 plain-language candidate", () => {
  it("rewords all 113 rules without adding, deleting or renumbering a rule", () => {
    expect(SSC_RULEBOOK.version).toBe("4.2");
    expect(SSC_RULES).toHaveLength(113);
    const officialIds = SSC_RULES.map(({ id }) => id).sort();
    expect(Object.keys(CLEAR_RULE_BODIES).sort()).toEqual(officialIds);
    expect(Object.keys(PLAIN_SUMMARIES).sort()).toEqual(officialIds);
    for (const rule of SSC_RULES) {
      expect(rule.summary.length).toBeGreaterThan(20);
      expect(rule.body.length).toBeGreaterThan(0);
      expect(rule.body.every((paragraph) => paragraph.trim().length > 0)).toBe(true);
      expect(rule.body.join(" ")).not.toMatch(/\bshall\b/i);
    }
  });

  it("includes 2015 in the National Selection exclusion", () => {
    expect(bodyOf("6.5")).toContain("in 2015 or any later year");
    expect(getRuleById("6.5")?.prohibited?.join(" ")).toContain("in 2015 or later");
    expect(bodyOf("6.5")).toContain("before 2015");
  });

  it("uses the song video when there is no official music video", () => {
    expect(bodyOf("6.3")).toContain("visualiser");
    expect(bodyOf("6.4")).toContain("If there is no official music video");
    expect(bodyOf("6.4")).toContain("YouTube video for the song instead");
    expect(bodyOf("6.4")).toContain("fewer than 25 million");
    expect(bodyOf("6.4")).toContain("fewer than 20 million");
  });

  it("waives previous-country artist permission only without an active HoD", () => {
    const reuse = bodyOf("6.6");
    expect(reuse).toContain("no active Head of Delegation");
    expect(reuse).toContain("permission is not required");
    expect(reuse).toContain("no more than three times");
    expect(reuse).toContain("cannot compete again after winning");
  });

  it("allows withdrawal after the deadline but before entry publication", () => {
    const withdrawal = bodyOf("15.1");
    expect(withdrawal).toContain("before its entry is published");
    expect(withdrawal).toContain("not automatically punished");
    expect(bodyOf("15.2")).toContain("after its entry has been officially published");
  });

  it("keeps exactly the same ten sanctions and distinguishes bonus and regular points", () => {
    const sanction = getRuleById("17.2");
    expect(sanction?.bullets).toHaveLength(10);
    expect(sanction?.bullets?.[0]).toBe("Level 1 · Official Warning");
    expect(sanction?.bullets?.[9]).toBe("Level 10 · Lifetime Ban");
    expect(bodyOf("17.2")).toContain("subtracted directly from the country's points");
    expect(bodyOf("17.2")).toContain("where an edition awards no bonus points");
    expect(bodyOf("17.3")).toContain("starting points rather than automatic outcomes");
  });

  it("corrects the two outdated rule references", () => {
    const timing = [bodyOf("12.2"), getRuleById("12.2")?.important].join(" ");
    expect(timing).toContain("Rules 12.5 and 19.4");
    expect(timing).not.toContain("Rules 8.5 and 13.4");
    const hierarchy = bodyOf("20.2");
    expect(hierarchy).toContain("Rule 21.1");
    expect(hierarchy).not.toContain("under Rule 15.1");
  });

  it("keeps the six-completed-edition Dormant protection boundary", () => {
    expect(bodyOf("22.4")).toContain("fewer than six consecutive completed editions");
    expect(bodyOf("22.5")).toContain("six consecutive SSC Editions");
    expect(bodyOf("22.5")).toContain("no active Head of Delegation at any point");
    expect(bodyOf("22.5")).toContain("Having an active HoD even briefly");
    expect(bodyOf("22.6")).toContain("Rule 22.7");
    expect(bodyOf("22.10")).toContain("past editions");
  });

  it("shows clear definitions on rule details and keeps searches usable", () => {
    const rule = getRuleById("22.5");
    expect(rule).not.toBeNull();
    const terms = glossaryForRule(rule!);
    expect(terms.some((item) => item.term === "Dormant country")).toBe(true);
    expect(searchSscRules("inactive country").some((item) => item.id === "22.5")).toBe(true);
    expect(searchSscRules("2015 national selection").some((item) => item.id === "6.5")).toBe(true);
  });
});
