import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { ROLEPLAY_QUICK_ANSWERS } from "@/lib/ssc-rules/roleplay";
import { roleplayQuickAnswersForVersion } from "@/lib/ssc-rules/roleplay-quick-answers";
import { findRuleSearchQuickAnswer } from "@/lib/v3-rules-quick-answer-search";

const source = (file: string) => readFileSync(file, "utf8");

describe("Current published v4.2 Rules help language", () => {
  it("keeps historical v4.1 quick-answer copy unchanged", () => {
    expect(roleplayQuickAnswersForVersion("4.1")).toBe(ROLEPLAY_QUICK_ANSWERS);
    expect(roleplayQuickAnswersForVersion("4.1")[2]?.question).toBe(
      "Can a Dormant country be completely eliminated?",
    );
    expect(roleplayQuickAnswersForVersion("4.2")).not.toBe(ROLEPLAY_QUICK_ANSWERS);
  });

  it("uses Unprotected consistently in all five current quick answers", () => {
    const answers = roleplayQuickAnswersForVersion("4.2");
    expect(answers).toHaveLength(5);
    expect(answers.map((answer) => answer.id)).toEqual(
      ROLEPLAY_QUICK_ANSWERS.map((answer) => answer.id),
    );
    for (const answer of answers) {
      expect(answer.question + " " + answer.explanation).not.toMatch(
        /\b(dormant|dormancy|annexation|canonical|unilateral|sanction)\b/i,
      );
      expect(answer.ruleIds.length).toBeGreaterThan(0);
    }
    expect(answers[1]?.explanation).toContain("six SSC editions in a row");
    expect(answers[2]?.explanation).toContain("If a new HoD arrives before removal");
    expect(answers[2]?.explanation).toContain("past SSC results stay in the archive");
    expect(answers[3]?.explanation).toContain("no active HoD at any time");
  });

  it("returns current wording even for old search terms and bookmarked questions", () => {
    const byNewName = findRuleSearchQuickAnswer(
      "Can an Unprotected country be removed from the map?",
      "4.2",
    );
    const byOldName = findRuleSearchQuickAnswer(
      "Can a Dormant country be completely eliminated?",
      "4.2",
    );
    expect(byNewName?.id).toBe("destroy-dormant-country");
    expect(byOldName?.id).toBe("destroy-dormant-country");
    expect(byOldName?.question).toBe(byNewName?.question);
    expect(byOldName?.question).not.toContain("Dormant");
    expect(findRuleSearchQuickAnswer("country", "4.2")).toBeNull();
    expect(findRuleSearchQuickAnswer("Can I annex a country with an active HOD?", "4.2")).toBeNull();
  });

  it("uses the released version on the home, answers, search and chapter routes", () => {
    const home = source("src/components/rules/RulesHomeV5.tsx");
    const answers = source("src/routes/rules/answers.tsx");
    const search = source("src/routes/rules/search.tsx");
    const chapter = source("src/routes/rules/chapters/$chapter.tsx");
    const glossary = source("src/lib/ssc-rules/glossary.ts");

    expect(home).toContain("roleplayQuickAnswersForVersion(version)");
    expect(home).toContain("Country stories, protection, borders and the official map.");
    expect(answers).toContain("roleplayQuickAnswersForVersion(version)");
    expect(search).toContain("findRuleSearchQuickAnswer(q, version)");
    expect(chapter).toContain('compareRulebookVersions(publishedRulebookVersion, "4.2") >= 0');
    expect(chapter).toContain("const atAGlance = usesV42CountryName");
    expect(glossary).not.toContain("proposed v4.2 name");
  });
});
