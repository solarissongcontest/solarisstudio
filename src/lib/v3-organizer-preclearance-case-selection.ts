/**
 * The private rule-question queue is authoritative for which cases may be
 * selected in the Organizer preclearance workspace. Never let a stale UI
 * selection or an errored query select an older case from cached data.
 */
export function resolvePrivateRuleQuestionSelection<T extends { id: string; case_kind: string }>(
  cases: readonly T[] | undefined,
  selectedCase: string,
  verified: boolean,
): { questions: T[]; caseId: string } {
  if (!verified) return { questions: [], caseId: "" };

  const questions = (cases ?? []).filter((item) => item.case_kind === "rule_question");
  return {
    questions,
    caseId: questions.find((item) => item.id === selectedCase)?.id ?? questions[0]?.id ?? "",
  };
}
