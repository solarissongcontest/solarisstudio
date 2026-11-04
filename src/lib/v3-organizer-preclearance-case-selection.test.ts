import { describe, expect, it } from "vitest";

import { resolvePrivateRuleQuestionSelection } from "./v3-organizer-preclearance-case-selection";

const cases = [
  { id: "case-a", case_kind: "rule_question" },
  { id: "case-b", case_kind: "report" },
  { id: "case-c", case_kind: "rule_question" },
] as const;

describe("verified Organizer private rule-question selection", () => {
  it("selects the first actual rule question by default", () => {
    expect(resolvePrivateRuleQuestionSelection(cases, "", true)).toEqual({
      questions: [cases[0], cases[2]],
      caseId: "case-a",
    });
  });

  it("preserves only a selection still present in the verified question queue", () => {
    expect(resolvePrivateRuleQuestionSelection(cases, "case-c", true).caseId).toBe("case-c");
    expect(resolvePrivateRuleQuestionSelection(cases, "case-b", true).caseId).toBe("case-a");
    expect(resolvePrivateRuleQuestionSelection(cases, "case-removed", true).caseId).toBe("case-a");
  });

  it("does not leak stale cached questions into an unverified or failed queue", () => {
    expect(resolvePrivateRuleQuestionSelection(cases, "case-c", false)).toEqual({
      questions: [],
      caseId: "",
    });
  });

  it("fails closed when the selected rule question disappears or changes kind", () => {
    expect(resolvePrivateRuleQuestionSelection([cases[1]], "case-a", true)).toEqual({
      questions: [],
      caseId: "",
    });
    expect(resolvePrivateRuleQuestionSelection(undefined, "case-c", true).caseId).toBe("");
  });
});
