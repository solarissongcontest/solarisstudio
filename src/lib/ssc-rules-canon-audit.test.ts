import { describe, expect, it } from "vitest";

import {
  LEGACY_RULE_ALIASES,
  QUICK_RULE_IDS,
  RULEBOOK_STATS,
  SSC_RULEBOOK,
  SSC_RULES,
  SSC_RULE_CHAPTERS,
  getRuleById,
} from "@/lib/ssc-rules-v4";

const VALID_EXAMPLE_OUTCOMES = new Set(["allowed", "not-allowed", "depends", "information"]);

function textFor(ruleId: string) {
  const rule = getRuleById(ruleId);
  expect(rule, `Expected Rule ${ruleId} to exist`).not.toBeNull();
  return [
    rule?.title,
    rule?.summary,
    ...(rule?.body ?? []),
    ...(rule?.bullets ?? []),
    ...(rule?.allowed ?? []),
    ...(rule?.prohibited ?? []),
    rule?.important,
    ...(rule?.tags ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

describe("SSC v4 canon audit", () => {
  it("keeps exactly 21 numbered chapters with unique current rule ids", () => {
    expect(SSC_RULEBOOK.version).toBe("4.0");
    expect(RULEBOOK_STATS.chapters).toBe(21);
    expect(SSC_RULE_CHAPTERS.map((chapter) => chapter.number)).toEqual(
      Array.from({ length: 21 }, (_, index) => index + 1),
    );

    const ids = SSC_RULES.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(RULEBOOK_STATS.rules);

    for (const rule of SSC_RULES) {
      const chapterNumber = Number(rule.id.split(".")[0]);
      const chapter = SSC_RULE_CHAPTERS.find((candidate) => candidate.number === chapterNumber);
      expect(chapter, `Rule ${rule.id} points to missing chapter ${chapterNumber}`).toBeDefined();
      expect(
        chapter?.rules.some((candidate) => candidate.id === rule.id),
        `Rule ${rule.id} is not contained by Chapter ${chapterNumber}`,
      ).toBe(true);
    }
  });

  it("keeps every canonical rule structurally complete and chapter-consistent", () => {
    const seen = new Map<string, number>();

    for (const chapter of SSC_RULE_CHAPTERS) {
      expect(chapter.slug.trim()).not.toBe("");
      expect(chapter.title.trim()).not.toBe("");
      expect(chapter.shortTitle.trim()).not.toBe("");
      expect(chapter.description.trim()).not.toBe("");
      expect(chapter.atAGlance.length).toBeGreaterThan(0);

      for (const rule of chapter.rules) {
        seen.set(rule.id, (seen.get(rule.id) ?? 0) + 1);
        expect(rule.id, `Invalid canonical rule id ${rule.id}`).toMatch(/^\d+\.\d+$/);
        const idChapterNumber = Number(rule.id.split(".")[0]);
        expect(idChapterNumber, `${rule.id} is stored under the wrong chapter`).toBe(chapter.number);
        expect(rule.title.trim(), `${rule.id} missing title`).not.toBe("");
        expect(rule.summary.trim(), `${rule.id} missing summary`).not.toBe("");
        expect(rule.body.length, `${rule.id} missing official wording`).toBeGreaterThan(0);
        expect(rule.body.every((paragraph) => paragraph.trim().length > 0), `${rule.id} has an empty body paragraph`).toBe(true);
        expect(rule.tags.length, `${rule.id} missing search tags`).toBeGreaterThan(0);

        const normalizedTags = rule.tags.map((tag) => tag.trim().toLowerCase());
        expect(
          new Set(normalizedTags).size,
          `${rule.id} contains duplicate tags: ${normalizedTags.join(", ")}`,
        ).toBe(normalizedTags.length);

        for (const example of rule.examples ?? []) {
          expect(example.title.trim(), `${rule.id} has an untitled example`).not.toBe("");
          expect(example.detail.trim(), `${rule.id} has an empty example`).not.toBe("");
          expect(VALID_EXAMPLE_OUTCOMES.has(example.outcome), `${rule.id} has invalid example outcome ${example.outcome}`).toBe(true);
        }
      }
    }

    expect([...seen.keys()].sort()).toEqual(SSC_RULES.map((rule) => rule.id).sort());
    expect([...seen.entries()].filter(([, count]) => count !== 1)).toEqual([]);
  });

  it("keeps every related-rule reference resolvable and non-self-referential", () => {
    const broken = SSC_RULES.flatMap((rule) =>
      (rule.relatedRules ?? [])
        .filter((relatedId) => !getRuleById(relatedId))
        .map((relatedId) => `${rule.id} -> ${relatedId}`),
    );
    const selfReferences = SSC_RULES.flatMap((rule) =>
      (rule.relatedRules ?? []).filter((relatedId) => relatedId === rule.id).map(() => rule.id),
    );
    expect(broken).toEqual([]);
    expect(selfReferences).toEqual([]);
  });

  it("keeps every quick-rule reference resolvable and unique", () => {
    expect(QUICK_RULE_IDS.length).toBeGreaterThan(0);
    expect(QUICK_RULE_IDS.filter((ruleId) => !getRuleById(ruleId))).toEqual([]);
    expect(new Set(QUICK_RULE_IDS).size).toBe(QUICK_RULE_IDS.length);
  });

  it("preserves objective artist-popularity thresholds at the official check time", () => {
    const eligibility = textFor("6.4");
    expect(eligibility).toContain("25");
    expect(eligibility).toContain("spotify");
    expect(eligibility).toContain("20");
    expect(eligibility).toContain("youtube");
    expect(eligibility).toMatch(/reference|check time|official.*time/);
    expect(eligibility).toMatch(/subjective|mainstream/);
  });

  it("preserves Eurovision and National Selection restrictions", () => {
    const history = textFor("6.5");
    expect(history).toContain("eurovision");
    expect(history).toContain("national selection");
    expect(history).toContain("2015");
  });

  it("preserves artist reuse, country association, permission and the three-appearance cap", () => {
    const reuse = textFor("6.6");
    expect(reuse).toMatch(/three|3/);
    expect(reuse).toMatch(/same country|original delegation|represented/);
    expect(reuse).toContain("permission");
    expect(reuse).toMatch(/winner|winning artist/);
    expect(reuse).toMatch(/internal|real-world|ownership/);
  });

  it("keeps friendship lawful while prohibiting actual vote coordination", () => {
    const friendship = textFor("11.4");
    expect(friendship).toMatch(/friend|friendship|relationship/);
    expect(friendship).toMatch(/not.*misconduct|allowed|not prohibited/);

    const coordination = textFor("11.2");
    expect(coordination).toMatch(/coordination|reciprocal|vote trading|agreement/);
  });

  it("keeps automated integrity analysis as a review signal rather than proof", () => {
    const automatedReview = textFor("11.5");
    expect(automatedReview).toMatch(/signal|flag|review/);
    expect(automatedReview).toMatch(/not.*proof|not.*guilt|human decision|cannot.*determine/);
  });

  it("preserves the exact ten-level sanction ladder", () => {
    const levels = getRuleById("17.2")?.bullets ?? [];
    expect(levels).toEqual([
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
  });

  it("keeps typical violation levels non-automatic and subject to aggravating or mitigating factors", () => {
    const typical = textFor("17.3");
    expect(typical).toMatch(/starting point|not automatic/);
    expect(typical).toMatch(/aggravat|mitigat/);
    expect(typical).toContain("vote trading");
    expect(typical).toContain("level 9");
  });

  it("preserves the 48-hour appeal window and fresh-review principle", () => {
    const appealWindow = textFor("18.1");
    expect(appealWindow).toContain("48");

    const review = [textFor("18.2"), textFor("18.3"), textFor("18.4")].join(" ");
    expect(review).toMatch(/fresh|independent|review/);
    expect(review).toMatch(/conflict|recus/);
  });

  it("keeps hosting explicitly creative and online rather than a physical-event obligation", () => {
    const hosting = [textFor("8.1"), textFor("8.2")].join(" ");
    expect(hosting).toMatch(/creative|online/);
    expect(hosting).toMatch(/not.*physical|physical-event|physical event/);
  });

  it("keeps legacy ids migration-only when they collide with current v4 ids", () => {
    for (const [legacyId, currentId] of Object.entries(LEGACY_RULE_ALIASES)) {
      expect(getRuleById(currentId)?.id).toBe(currentId);
      if (SSC_RULES.some((rule) => rule.id === legacyId)) {
        expect(getRuleById(legacyId)?.id).toBe(legacyId);
      }
    }
  });
});
