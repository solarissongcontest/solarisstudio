import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  countRuleChapters,
  filterRuleChapterDirectory,
  RULE_CHAPTER_DIRECTORY_GROUPS,
} from "./v3-rule-chapter-directory";

describe("V3 Rulebook chapter directory", () => {
  it("indexes every official chapter exactly once without changing canonical numbers", () => {
    const groups = filterRuleChapterDirectory("");
    const numbers = groups.flatMap((group) => group.chapters.map((chapter) => chapter.number));
    expect(numbers).toHaveLength(22);
    expect(new Set(numbers).size).toBe(22);
    expect([...numbers].sort((a, b) => a - b)).toEqual(Array.from({ length: 22 }, (_, i) => i + 1));
    expect(countRuleChapters(groups)).toBe(22);
    expect(RULE_CHAPTER_DIRECTORY_GROUPS.some((group) => group.title === "Worldbuilding")).toBe(true);
  });

  it("searches the official chapter metadata and scopes without creating a second rulebook", () => {
    expect(countRuleChapters(filterRuleChapterDirectory(""))).toBe(22);
    expect(countRuleChapters(filterRuleChapterDirectory("WORLDbuilding"))).toBeGreaterThan(0);
    expect(countRuleChapters(filterRuleChapterDirectory("22"))).toBe(1);
    expect(countRuleChapters(filterRuleChapterDirectory("22", "Worldbuilding"))).toBe(1);
    expect(filterRuleChapterDirectory("zz-no-existing-ssc-chapter")).toEqual([]);
    expect(filterRuleChapterDirectory("", "Worldbuilding").flatMap((group) => group.chapters.map((c) => c.number))).toEqual([22]);
  });

  it("keeps official deep links and separate installed, phone-web and desktop presentations", () => {
    const route = readFileSync("src/routes/rules/chapters/index.tsx", "utf8");
    const family = readFileSync("src/components/v3/V3DirectoryFamilyIndex.tsx", "utf8");
    const css = readFileSync("src/styles/v3-directory-family.css", "utf8");
    expect(route).toContain("RulesRouteShell");
    expect(route).toContain("GovernanceStatusStrip");
    // Chapter deep links are data-driven in the shared directory component.\n    expect(route).toContain("filterRuleChapterDirectory");
    expect(route).toContain("V3DirectoryFamilyIndex");
    expect(route).toContain("noShell");
    expect(route).toContain('to: "/rules/chapters/$chapter"');
    expect(route).toContain("params: { chapter: chapter.slug }");
    expect(family).toContain("platformResolved");
    expect(family).toContain('data-directory-experience={presentation}');
    expect(family).toContain('data-directory-mobile-header=""');
    expect(family).toContain("v3-directory-mobile-list");
    expect(family).toContain("v3-directory-desktop-grid");
    expect(family).toContain("v3-directory-desktop-rail");
    expect(family).toContain("AppGroupedList");
    expect(family).toContain("noShell ? content");
    expect(css).toContain('[data-directory-experience="mobile-web"]');
    expect(route).not.toContain("<AppShell>");
  });
});
