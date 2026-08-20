import { betaSectionsRound2 } from "./sections-round-2";
import type { BetaAnswer, BetaAnswers, BetaQuestion } from "./types";

export const BETA_DRAFT_KEY = "solaris:public-beta-test:draft:v3";
export const BETA_SUBMITTED_KEY = "solaris:public-beta-test:submitted:v3";
export const BETA_FORM_VERSION = 3;

export const betaSections = betaSectionsRound2;

export function isBetaQuestionVisible(question: BetaQuestion, answers: BetaAnswers) {
  if (!question.showWhen) return true;
  const actual = answers[question.showWhen.id];
  const rule = question.showWhen;

  if (rule.equals !== undefined) return actual === rule.equals;
  if (rule.notEquals !== undefined) {
    if (Array.isArray(actual)) return !actual.includes(rule.notEquals);
    return actual !== undefined && actual !== rule.notEquals;
  }
  if (rule.oneOf) return typeof actual === "string" && rule.oneOf.includes(actual);
  if (rule.includes) return Array.isArray(actual) && actual.includes(rule.includes);
  return true;
}

export function isBetaAnswerEmpty(value: BetaAnswer | undefined) {
  if (value === undefined || value === null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

export function formatBetaAnswer(value: BetaAnswer | string | undefined) {
  if (isBetaAnswerEmpty(value as BetaAnswer | undefined)) return "Not answered";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") {
    return Object.entries(value)
      .map(([key, answer]) => `${key}: ${answer}`)
      .join(" · ");
  }
  return String(value);
}

export function toggleBetaMulti(current: string[], option: string) {
  if (option === "None of these") return current.includes(option) ? [] : [option];
  const withoutNone = current.filter((item) => item !== "None of these");
  if (withoutNone.includes(option)) return withoutNone.filter((item) => item !== option);
  return [...withoutNone, option];
}
