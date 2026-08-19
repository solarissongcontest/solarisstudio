import { describe, expect, it } from "vitest";

import {
  ADMIN_BETA_COVERAGE,
  ADMIN_BETA_FORM_VERSION,
  ADMIN_BETA_TESTED_OPTIONS,
  buildAdminBetaSections,
} from "@/features/admin-beta-test/sections";

describe("admin beta acceptance coverage", () => {
  const sections = buildAdminBetaSections("ssc-22");
  const questions = sections.flatMap((section) => section.questions);
  const questionById = new Map(questions.map((question) => [question.id, question]));

  it("uses the comprehensive v2 acceptance test", () => {
    expect(ADMIN_BETA_FORM_VERSION).toBe(2);
    expect(ADMIN_BETA_COVERAGE.length).toBeGreaterThanOrEqual(40);
    expect(questions.length).toBeGreaterThanOrEqual(110);
  });

  it("gives every tracked admin surface a required coverage answer", () => {
    const answerIds = ADMIN_BETA_COVERAGE.map((item) => item.answerId);
    expect(new Set(answerIds).size).toBe(answerIds.length);

    for (const item of ADMIN_BETA_COVERAGE) {
      const question = questionById.get(item.answerId);
      expect(question, `${item.label} needs a coverage question`).toBeDefined();
      expect(question?.required, `${item.label} coverage must be required`).toBe(true);
      expect(question?.type, `${item.label} coverage must be a single choice`).toBe("single");
      expect(question?.options).toEqual([...ADMIN_BETA_TESTED_OPTIONS]);
    }
  });

  it("covers the critical organizer and service workflows", () => {
    const ids = new Set(ADMIN_BETA_COVERAGE.map((item) => item.id));
    const required = [
      "overview",
      "edition-library",
      "edition-workspace",
      "shows",
      "entries",
      "jury",
      "voting-system",
      "televote-totals",
      "publication",
      "edition-theme",
      "design",
      "live-broadcast",
      "country-accounts",
      "hod-history",
      "sync-health",
      "delegations-overview",
      "delegation-responses",
      "delegation-response-review",
      "submission-rounds",
      "recovery-access",
      "delegation-edition-links",
      "voting-overview",
      "voting-edition-links",
      "voting-rounds",
      "voting-round-entries",
      "voting-results",
      "combined-results",
      "voting-intelligence",
      "voting-audit",
      "mobile",
      "session",
      "concurrency",
      "rehearsal",
    ];

    for (const id of required) expect(ids.has(id), `${id} should stay covered`).toBe(true);
  });

  it("includes real route handoffs for each major subsystem", () => {
    const hrefs = sections.map((section) => section.task?.href).filter(Boolean).join("\n");
    expect(hrefs).toContain("/admin/operations");
    expect(hrefs).toContain("/admin/shows/ssc-22");
    expect(hrefs).toContain("/admin/jury/ssc-22");
    expect(hrefs).toContain("/admin/publication/ssc-22");
    expect(hrefs).toContain("/confirmations/admin");
    expect(hrefs).toContain("/televoting/admin");
    expect(hrefs).toContain("/televoting/admin/results");
    expect(hrefs).toContain("/televoting/admin/analytics");
  });
});
