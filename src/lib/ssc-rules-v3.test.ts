import { describe, expect, it } from "vitest";

import {
  LEGACY_RULE_ALIASES,
  RULEBOOK_STATS,
  SSC_RULEBOOK,
  getRuleById,
  searchSscRules,
} from "@/lib/ssc-rules-v3";

describe("SSC online-first General Regulations", () => {
  it("uses the promised 21-chapter online-first architecture", () => {
    expect(SSC_RULEBOOK.version).toBe("4.0");
    expect(SSC_RULEBOOK.status.toLowerCase()).toContain("online-first");
    expect(RULEBOOK_STATS.chapters).toBe(21);
    expect(RULEBOOK_STATS.rules).toBeGreaterThan(60);
  });

  it("defines confirmation slots using official server receipt order", () => {
    const rule = getRuleById("4.6");
    expect(rule?.title).toContain("Confirmation");
    expect(rule?.body.join(" ").toLowerCase()).toContain("official server");
    expect(rule?.important?.toLowerCase()).toContain("device latency");
    expect(rule?.prohibited?.join(" ").toLowerCase()).toContain("bots");
  });

  it("does not use subjective mainstream status as a hidden eligibility rule", () => {
    const rule = getRuleById("6.4");
    const body = rule?.body.join(" ").toLowerCase() ?? "";
    expect(body).toContain("subjectively described as mainstream");
    expect(body).toContain("published measurable requirements");
    expect(body).toContain("objective restriction");
  });

  it("keeps automated friend-voting analysis as a human-review signal", () => {
    const rule = getRuleById("11.5");
    expect(rule?.important?.toLowerCase()).toContain("review signals only");
    expect(rule?.important?.toLowerCase()).toContain("human decision");
  });

  it("preserves the canonical ten-level sanction ladder", () => {
    const rule = getRuleById("17.2");
    expect(rule?.title).toBe("Sanction Levels");
    expect(rule?.bullets).toEqual([
      "Level 1 · Official Warning",
      "Level 2 · Loss of 50% of Bonus Points",
      "Level 3 · No Bonus Points Awarded",
      "Level 4 · −5 Contest Points",
      "Level 5 · −25 Contest Points",
      "Level 6 · −50 Contest Points",
      "Level 7 · −100 Contest Points",
      "Level 8 · Disqualification",
      "Level 9 · Disqualification + One-Edition Ban",
      "Level 10 · Lifetime Ban",
    ]);
    expect(rule?.important?.toLowerCase()).toContain("aggravating or mitigating");
  });

  it("keeps typical sanctions as starting levels rather than automatic outcomes", () => {
    const rule = getRuleById("17.3");
    expect(rule?.title).toBe("Typical Violation Levels");
    expect(rule?.body.join(" ").toLowerCase()).toContain("starting points rather than automatic outcomes");
    expect(rule?.bullets?.join(" ")).toContain("Vote trading or coordinated voting · Level 9");
    expect(rule?.bullets?.join(" ")).toContain("Serious threats toward SSC or participants · Level 10");
  });

  it("separates people, delegations, countries, entries and votes when sanctioning", () => {
    const rule = getRuleById("17.7");
    expect(rule?.body.join(" ").toLowerCase()).toContain("fictional country");
    expect(rule?.body.join(" ").toLowerCase()).toContain("invalidating a vote");
  });

  it("requires a dedicated edition-specific regulation chapter", () => {
    const rule = getRuleById("20.1");
    expect(rule?.bullets?.join(" ").toLowerCase()).toContain("confirmation opening time");
    expect(rule?.bullets?.join(" ").toLowerCase()).toContain("jury and televote formats");
    expect(getRuleById("20.2")?.title).toContain("Hierarchy");
  });

  it("keeps old numbering available for migration and search without overriding current ids", () => {
    expect(LEGACY_RULE_ALIASES["14.8"]).toBe("16.3");
    expect(LEGACY_RULE_ALIASES["8.7"]).toBe("4.6");

    // 14.8 now exists in v4, so the current official rule wins that URL.
    expect(getRuleById("14.8")?.id).toBe("14.8");

    // There is no current 8.7, so this non-colliding legacy id can still resolve.
    expect(getRuleById("8.7")?.id).toBe("4.6");

    expect(searchSscRules("legacy rule 14.8").some((rule) => rule.id === "16.3")).toBe(true);
  });

  it("searches the online-first concepts under their new official ids", () => {
    expect(searchSscRules("confirmation slot").some((rule) => rule.id === "4.6")).toBe(true);
    expect(searchSscRules("server timestamp").some((rule) => ["4.5", "4.6", "12.2"].includes(rule.id))).toBe(true);
    expect(searchSscRules("copyright").some((rule) => rule.id === "13.3")).toBe(true);
    expect(searchSscRules("lifetime ban").some((rule) => rule.id === "17.2")).toBe(true);
  });
});