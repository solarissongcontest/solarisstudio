import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  BUNDLED_RULEBOOK_META,
  compareRulebookVersions,
  getRuleById,
  isPublishedReleaseCompatibleWithBundledCanon,
  searchSscRules,
  SSC_RULEBOOK,
  SSC_RULE_CHAPTERS,
} from "@/lib/ssc-rules-v4";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("SSC Roleplay & Worldbuilding contract", () => {
  it("ships Chapter 22 as the v4.1 current canon without renumbering prior chapters", () => {
    expect(SSC_RULEBOOK.version).toBe("4.1");
    expect(BUNDLED_RULEBOOK_META.version).toBe("4.1");
    expect(SSC_RULE_CHAPTERS).toHaveLength(22);
    expect(SSC_RULE_CHAPTERS.at(-1)?.number).toBe(22);
    expect(SSC_RULE_CHAPTERS.at(-1)?.slug).toBe("roleplay-worldbuilding");
    expect(getRuleById("21.1")?.id).toBe("21.1");
    expect(getRuleById("22.1")?.chapterNumber).toBe(22);
  });

  it("carries the already-published v4.0.1 definitions into the bundled v4.1 canon", () => {
    const terms = getRuleById("2.1")?.body.join(" ") ?? "";
    expect(terms).toContain("Appeal: A formal request for TSBC to review a decision");
    expect(terms).toContain("Head of Delegation (HoD)");
    expect(terms).toContain("Withdrawal: The formal removal of a Country from an Edition");
  });

  it("makes the six-completed-edition threshold explicit and searchable", () => {
    const dormant = getRuleById("22.5");
    const protectedCountry = getRuleById("22.4");
    const elimination = getRuleById("22.6");

    expect(dormant?.body.join(" ")).toContain("six consecutive SSC Editions");
    expect(dormant?.body.join(" ")).toContain("no active Head of Delegation at any point");
    expect(protectedCountry?.body.join(" ")).toContain("Withdrawal");
    expect(elimination?.body.join(" ")).toContain("completely eliminated");

    expect(searchSscRules("hodless country").some((rule) => rule.id === "22.5")).toBe(true);
    expect(searchSscRules("annex dormant country").some((rule) => rule.id === "22.6")).toBe(true);
    expect(searchSscRules("erase country from map").some((rule) => rule.id === "22.6")).toBe(true);
  });

  it("will not let an older published release downgrade a newer bundled structural canon", () => {
    expect(compareRulebookVersions("4.1", "4.0")).toBe(1);
    expect(compareRulebookVersions("4.1.0", "4.1")).toBe(0);
    expect(compareRulebookVersions("4.2", "4.1")).toBe(1);
    expect(isPublishedReleaseCompatibleWithBundledCanon({ version: "4.0.1" })).toBe(false);
    expect(isPublishedReleaseCompatibleWithBundledCanon({ version: "4.1" })).toBe(true);
    expect(isPublishedReleaseCompatibleWithBundledCanon({ version: "4.2" })).toBe(true);
  });

  it("reconciles a lagging server history without pretending the bundled release has a recorded publish date", () => {
    const governance = source("src/lib/rules-governance.ts");
    const history = source("src/routes/rules/changes.tsx");
    expect(governance).toContain("reconcileRulebookReleaseHistory");
    expect(governance).toContain("compareRulebookVersions(serverCurrent.version, BUNDLED_RULEBOOK_META.version)");
    expect(governance).toContain('change_kind: "added" as const');
    expect(governance).toContain("serverCurrent?.version ?? null");
    expect(history).toContain('"Current bundled"');
    expect(history).toContain('"Bundled with this app version"');
  });

  it("keeps the Rules product visual, responsive and app-safe", () => {
    const home = source("src/components/rules/RulesHomeV5.tsx");
    const roleplayVisual = source("src/components/rules/RoleplayWorldbuildingVisual.tsx");
    const chapter = source("src/routes/rules/chapters/$chapter.tsx");
    const detail = source("src/components/rules/RuleDetailV5.tsx");
    const checker = source("src/routes/rules/check.tsx");
    const journey = source("src/routes/rules/participating.tsx");
    const search = source("src/routes/rules/search.tsx");
    const navigation = source("src/lib/public-navigation.ts");

    expect(home).toContain("Roleplay & Worldbuilding");
    expect(home).toContain("env(safe-area-inset-bottom)");
    expect(roleplayVisual).toContain("Dormancy clock");
    expect(roleplayVisual).toContain("grid-cols-3");
    expect(roleplayVisual).toContain("sm:grid-cols-6");
    expect(chapter).toContain("RoleplayWorldbuildingVisual");
    expect(chapter).not.toContain("overflow-x-auto");
    expect(detail).toContain("What this means");
    expect(detail).toContain("Examples");
    expect(checker).toContain("min-h-12");
    expect(journey).toContain("md:grid-cols-2");
    const answerMatcher = source("src/lib/v3-rules-quick-answer-search.ts");
    expect(search).toContain("findRuleSearchQuickAnswer");
    expect(answerMatcher).toContain("ROLEPLAY_QUICK_ANSWERS");
    expect(navigation).toContain("Browse all 22 chapters");
    expect(navigation).toContain('"/rules/chapters/roleplay-worldbuilding"');
  });
});
