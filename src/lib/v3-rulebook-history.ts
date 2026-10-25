import { SOLARIS_TIME_ZONE } from "@/lib/public-time";

export const RULEBOOK_HISTORY_LOCALE = "en-GB";

export type RulebookHistoryRuleTarget = {
  to: "/rules/$ruleId";
  params: { ruleId: string };
};

export function formatRulebookHistoryDate(value?: string | null) {
  if (!value) return "not recorded";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(RULEBOOK_HISTORY_LOCALE, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: SOLARIS_TIME_ZONE,
  }).format(date);
}

/**
 * Rule detail is mutable current-rule content. Historical releases therefore
 * stay on their immutable before/after snapshots instead of pretending that
 * today's /rules/:ruleId page is the historical rule body.
 */
export function resolveRulebookHistoryRuleTarget(
  isCurrentRelease: boolean,
  ruleId: string,
): RulebookHistoryRuleTarget | null {
  if (!isCurrentRelease) return null;

  return {
    to: "/rules/$ruleId",
    params: { ruleId },
  };
}
