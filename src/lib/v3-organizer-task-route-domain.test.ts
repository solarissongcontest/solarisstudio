import { describe, expect, it } from "vitest";

import { organizerTaskDomain } from "./v3-organizer-task-domain";

function task(href: string, sourceKind: string, taskType: string) {
  return { href, sourceKind, taskType };
}

describe("V3 Organizer Tasks domain taxonomy", () => {
  it("keeps confirmation and delegation work in Delegations", () => {
    expect(
      organizerTaskDomain(task("/confirmations/admin/responses", "confirmation", "confirmation.review")),
    ).toBe("delegations");
    expect(
      organizerTaskDomain(task("/admin/countries/oland", "delegation", "delegation.attention")),
    ).toBe("delegations");
  });

  it("keeps entry and media work as distinct operational domains", () => {
    expect(organizerTaskDomain(task("/admin/countries/oland", "entry_review", "entry.review"))).toBe(
      "entries",
    );
    expect(
      organizerTaskDomain(task("/admin/countries/oland", "media_asset", "media.replacement")),
    ).toBe("media");
  });

  it("unifies jury and televote work under Voting while keeping integrity separate", () => {
    expect(
      organizerTaskDomain(task("/admin/jury/ssc-22", "jury_ballot", "jury.ballot.missing")),
    ).toBe("voting");
    expect(
      organizerTaskDomain(task("/televoting/admin", "televote_window", "televote.window.attention")),
    ).toBe("voting");
    expect(
      organizerTaskDomain(task("/admin/jury-integrity", "jury_integrity", "jury.integrity.review")),
    ).toBe("integrity");
  });

  it("surfaces communications independently instead of falling back to System", () => {
    expect(
      organizerTaskDomain(
        task("/admin/communications", "announcement_delivery", "communication.delivery.failed"),
      ),
    ).toBe("communications");
  });

  it("keeps rule-clarification notices in Communications instead of misclassifying them as Integrity", () => {
    expect(
      organizerTaskDomain(
        task(
          "/admin/communications",
          "announcement_delivery",
          "communication.rule_clarification.delivery_failed",
        ),
      ),
    ).toBe("communications");
  });

  it("falls back to System only when no canonical operational domain matches", () => {
    expect(
      organizerTaskDomain(task("/admin/system", "runtime_health", "system.health.review")),
    ).toBe("system");
  });
});
