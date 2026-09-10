import { describe, expect, it } from "vitest";

import {
  RULEBOOK_STATS,
  SSC_RULEBOOK,
  getRuleById,
  searchSscRules,
} from "@/lib/ssc-rules-v3";

describe("SSC online-first regulations v3", () => {
  it("identifies itself as the online-first general regulations", () => {
    expect(SSC_RULEBOOK.version).toBe("3.0");
    expect(SSC_RULEBOOK.status.toLowerCase()).toContain("online-first");
    expect(RULEBOOK_STATS.rules).toBeGreaterThan(60);
  });

  it("defines confirmation slots using official server receipt order", () => {
    const rule = getRuleById("8.7");
    expect(rule?.title).toContain("Confirmation");
    expect(rule?.body.join(" ").toLowerCase()).toContain("official server");
    expect(rule?.important?.toLowerCase()).toContain("device latency");
    expect(rule?.prohibited?.join(" ").toLowerCase()).toContain("bots");
  });

  it("does not use subjective mainstream status as a hidden eligibility rule", () => {
    const rule = getRuleById("4.4");
    expect(rule?.body.join(" ").toLowerCase()).toContain("subjectively described as mainstream");
    expect(rule?.body.join(" ").toLowerCase()).toContain("published objective");
  });

  it("keeps automated friend-voting analysis as a human-review signal", () => {
    const rule = getRuleById("7.8");
    expect(rule?.important?.toLowerCase()).toContain("review signals only");
    expect(rule?.important?.toLowerCase()).toContain("human decision");
  });

  it("uses targeted remedies instead of a mandatory numerical sanction ladder", () => {
    const rule = getRuleById("11.2");
    expect(rule?.title).toBe("Available Measures");
    expect(rule?.bullets?.join(" ").toLowerCase()).toContain("invalidation of an affected vote");
    expect(rule?.important?.toLowerCase()).toContain("restore fairness");
  });

  it("separates people, delegations, countries, entries and votes when sanctioning", () => {
    const rule = getRuleById("11.8");
    expect(rule?.body.join(" ").toLowerCase()).toContain("fictional country");
    expect(rule?.body.join(" ").toLowerCase()).toContain("invalidating a vote");
  });

  it("requires a proper edition-specific regulation layer", () => {
    const rule = getRuleById("15.2");
    expect(rule?.bullets?.join(" ").toLowerCase()).toContain("confirmation opening time");
    expect(rule?.bullets?.join(" ").toLowerCase()).toContain("jury and televote formats");
    expect(getRuleById("15.6")?.title).toContain("Hierarchy");
  });

  it("searches the new online-first concepts", () => {
    expect(searchSscRules("confirmation slot").some((rule) => rule.id === "8.7")).toBe(true);
    expect(searchSscRules("server timestamp").some((rule) => ["8.2", "8.7", "14.5"].includes(rule.id))).toBe(true);
    expect(searchSscRules("copyright").some((rule) => rule.id === "10.3")).toBe(true);
  });
});
