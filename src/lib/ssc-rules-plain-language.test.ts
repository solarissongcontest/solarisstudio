import { describe, expect, it } from "vitest";

import {
  CLEAR_RULE_BODIES,
  PLAIN_SUMMARIES,
  withPlainLanguage,
} from "@/lib/ssc-rules/plain-language-v42";
import { glossaryForRule } from "@/lib/ssc-rules/glossary";
import {
  SSC_RULEBOOK,
  SSC_RULES,
} from "@/lib/ssc-rules-v4";

const draftRules = SSC_RULES.map((rule) => withPlainLanguage(rule));
const draftRuleById = (id: string) => draftRules.find((rule) => rule.id === id) ?? null;

const bodyOf = (id: string) => {
  const rule = draftRuleById(id);
  expect(rule, `Missing rule ${id}`).not.toBeNull();
  return rule!.body.join(" ");
};

describe("SSC v4.2 plain-language candidate", () => {
  it("rewords all 113 rules without adding, deleting or renumbering a rule", () => {
    expect(SSC_RULEBOOK.version).toBe("4.1"); // Publication is governed; the draft must not be bundled as Current.
    expect(SSC_RULES).toHaveLength(113);
    const officialIds = SSC_RULES.map(({ id }) => id).sort();
    expect(Object.keys(CLEAR_RULE_BODIES).sort()).toEqual(officialIds);
    expect(Object.keys(PLAIN_SUMMARIES).sort()).toEqual(officialIds);
    for (const rule of draftRules) {
      expect(rule.summary.length).toBeGreaterThan(20);
      expect(rule.body.length).toBeGreaterThan(0);
      expect(rule.body.every((paragraph) => paragraph.trim().length > 0)).toBe(true);
      expect(rule.body.join(" ")).not.toMatch(/\bshall\b/i);
    }
  });

  it("includes 2015 in the National Selection exclusion", () => {
    expect(bodyOf("6.5")).toContain("in 2015 or any later year");
    expect(draftRuleById("6.5")?.prohibited?.join(" ")).toContain("in 2015 or later");
    expect(bodyOf("6.5")).toContain("before 2015");
  });

  it("uses the song video when there is no official music video", () => {
    expect(bodyOf("6.3")).toContain("visualiser");
    expect(bodyOf("6.4")).toContain("If there is no official music video");
    expect(bodyOf("6.4")).toContain("YouTube video for the song instead");
    expect(bodyOf("6.4")).toContain("fewer than 25 million");
    expect(bodyOf("6.4")).toContain("fewer than 20 million");
    expect(bodyOf("6.4")).toContain("most-viewed");
    expect(bodyOf("6.4")).toContain("before the entry deadline");
    expect(bodyOf("6.4")).toContain("full-song video that clearly shows which song it is");
    expect(bodyOf("6.4")).toContain("Only if neither official channel");
    expect(bodyOf("6.4")).toContain("A fan video does not take priority");
  });

  it("waives previous-country artist permission only without an active HoD", () => {
    const reuse = bodyOf("6.6");
    expect(reuse).toContain("no active Head of Delegation");
    expect(reuse).toContain("permission is not required");
    expect(reuse).toContain("no more than three times");
    expect(reuse).toContain("cannot compete again after winning");
    expect(draftRuleById("6.6")?.examples?.some((example) => example.title === "Previous country has no active HoD" && example.outcome === "allowed")).toBe(true);
  });

  it("allows friendship without treating a high vote alone as proof of cheating", () => {
    const voting = bodyOf("11.4");
    expect(voting).toContain("An HoD can give a friend's entry high points");
    expect(voting).toContain("Being friends with another HoD");
    expect(voting).toContain("HoDs agreed on how to vote");
    expect(voting).toContain("Friendship or similar voting patterns alone are not proof of cheating");
    expect(voting).not.toMatch(/\bplayers?\b/i);
    expect(voting).not.toContain("alliances and shared communities");
  });

  it("allows withdrawal after the deadline but before entry publication", () => {
    const withdrawal = bodyOf("15.1");
    expect(withdrawal).toContain("before its entry is published");
    expect(withdrawal).toContain("not automatically punished");
    expect(bodyOf("15.2")).toContain("after its entry has been officially published");
  });

  it("keeps exactly the same ten sanctions and distinguishes bonus and regular points", () => {
    const sanction = draftRuleById("17.2");
    expect(sanction?.bullets).toHaveLength(10);
    expect(sanction?.bullets?.[0]).toBe("Level 1 · Official Warning");
    expect(sanction?.bullets?.[9]).toBe("Level 10 · Lifetime Ban");
    expect(bodyOf("17.2")).toContain("must subtract all those points from the country's score");
    expect(bodyOf("17.2")).toContain("If an edition has no bonus points");
    expect(bodyOf("17.2")).toContain("choose a different penalty from the ten existing levels");
    expect(bodyOf("17.2")).toContain("explain its choice in writing");
    expect(bodyOf("17.2")).toContain("35 points and a 50-point penalty finishes with -15 points");
    expect(bodyOf("17.2")).toContain("negative score");
    expect(bodyOf("17.3")).toContain("starting points, not automatic results");
  });

  it("corrects the two outdated rule references", () => {
    const timing = [bodyOf("12.2"), draftRuleById("12.2")?.important].join(" ");
    expect(timing).toContain("Rules 12.5 and 19.4");
    expect(timing).not.toContain("Rules 8.5 and 13.4");
    const hierarchy = bodyOf("20.2");
    expect(hierarchy).toContain("Rule 21.1");
    expect(bodyOf("20.1")).toContain("HoDs should not have to search");
    expect(bodyOf("20.2")).toContain("before it affects HoDs");
    expect(hierarchy).not.toContain("under Rule 15.1");
  });

  it("keeps the exact six-edition boundary with clear Unprotected language", () => {
    expect(bodyOf("22.4")).toContain("six completed SSC editions in a row");
    expect(bodyOf("22.4")).toContain("An active HoD, even briefly");
    expect(bodyOf("22.5")).toContain("six SSC editions in a row");
    expect(bodyOf("22.5")).toContain("at any point during any of them");
    expect(bodyOf("22.5")).toContain("the count starts over");
    expect(bodyOf("22.5")).toContain("becomes Protected right away");
    expect(bodyOf("22.6")).toContain("Rule 22.7");
    expect(bodyOf("22.10")).toContain("past");
    expect(draftRuleById("22.5")?.title).toContain("Unprotected");
  });

  it("keeps all 113 draft rules and their help text free of old legal jargon", () => {
    const hardTerms = /\b(dormant|dormancy|force majeure|annexation|mitigating|aggravating|sanction|sanctions)\b/i;
    for (const rule of draftRules) {
      const userText = [
        rule.title,
        rule.summary,
        ...rule.body,
        rule.important ?? "",
        ...(rule.allowed ?? []),
        ...(rule.prohibited ?? []),
        ...(rule.bullets ?? []),
        ...(rule.examples ?? []).flatMap(({ title, detail }) => [title, detail]),
      ].join(" ");
      expect(userText, "Rule " + rule.id + " still contains old jargon").not.toMatch(hardTerms);
      expect(userText, "Rule " + rule.id + " uses vague narrative language").not.toMatch(/\b(?:quietly|silently)\b/i);
      expect(rule.summary.split(/\s+/).length, "Long summary for Rule " + rule.id).toBeLessThanOrEqual(32);
      for (const paragraph of rule.body) {
        // Mechanical guardrails are not a substitute for actual teen-reader review.
        for (const sentence of paragraph.split(/(?<=[.!?])\s+/)) {
          expect(sentence.split(/\s+/).length, "Long sentence in Rule " + rule.id).toBeLessThanOrEqual(38);
        }
      }
    }
  });

  it("shows clear definitions on rule details and keeps searches usable", () => {
    const rule = draftRuleById("22.5");
    expect(rule).not.toBeNull();
    const terms = glossaryForRule(rule!);
    expect(terms.some((item) => item.term === "Unprotected country")).toBe(true);
    expect(draftRuleById("22.5")?.summary.toLowerCase()).toContain("unprotected");
    expect(draftRuleById("6.5")?.summary).toContain("2015");
  });
});
