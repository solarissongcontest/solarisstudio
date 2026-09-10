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
    expect(rule?.body.join(" ").toLowerCase()).toContain("subjectively described as mainstream");
    expect(rule?.body.join(" ").toLowerCase()).toContain("published objective");
  });

  it("keeps automated friend-voting analysis as a human-review signal", () => {
    const rule = getRuleById("11.5");
    expect(rule?.important?.toLowerCase()).toContain("review signals only");
    expect(rule?.important?.toLowerCase()).toContain("human decision");
  });

  it("uses targeted remedies instead of a mandatory numerical sanction ladder", () => {
    const rule = getRuleById("17.2");
    expect(rule?.title).toBe("Available Measures");
    expect(rule?.bullets?.join(" ").toLowerCase()).toContain("invalidation of an affected vote");
    expect(rule?.important?.toLowerCase()).toContain("restore fairness");
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

  it("keeps old deep-link ids resolvable as migration aliases", () => {
    expect(LEGACY_RULE_ALIASES["14.8"]).toBe("16.3");
    expect(getRuleById("14.8")?.id).toBe("16.3");
    expect(getRuleById("8.7")?.id).toBe("4.6");
  });

  it("searches the online-first concepts under their new official ids", () => {
    expect(searchSscRules("confirmation slot").some((rule) => rule.id === "4.6")).toBe(true);
    expect(searchSscRules("server timestamp").some((rule) => ["4.5", "4.6", "12.2"].includes(rule.id))).toBe(true);
    expect(searchSscRules("copyright").some((rule) => rule.id === "13.3")).toBe(true);
  });
});
