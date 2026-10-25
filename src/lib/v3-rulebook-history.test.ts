import { describe, expect, it } from "vitest";

import {
  formatRulebookHistoryDate,
  resolveRulebookHistoryRuleTarget,
  RULEBOOK_HISTORY_LOCALE,
} from "./v3-rulebook-history";

describe("V3 rulebook history presentation policy", () => {
  it("formats canonical release chronology in fixed Solaris time", () => {
    expect(RULEBOOK_HISTORY_LOCALE).toBe("en-GB");
    expect(formatRulebookHistoryDate("2026-10-24T21:30:00.000Z")).toBe(
      "25 Oct 2026",
    );
  });

  it("fails soft for missing and invalid historical dates", () => {
    expect(formatRulebookHistoryDate(null)).toBe("not recorded");
    expect(formatRulebookHistoryDate("not-a-date")).toBe("not-a-date");
  });

  it("links only the current release to mutable current-rule detail", () => {
    expect(resolveRulebookHistoryRuleTarget(false, "12.4")).toBeNull();
    expect(resolveRulebookHistoryRuleTarget(true, "12.4")).toEqual({
      to: "/rules/$ruleId",
      params: { ruleId: "12.4" },
    });
  });
});
