import { describe, expect, it } from "vitest";

import { organizerTaskDomain } from "./v3-organizer-projection";

function task(href: string, sourceKind: string, taskType: string) {
  return { href, sourceKind, taskType };
}

describe("V3 Organizer projection task ownership", () => {
  it("keeps voting-specific integrity work inside Voting", () => {
    expect(
      organizerTaskDomain(task("/admin/jury-integrity", "jury_integrity", "jury.integrity.review")),
    ).toBe("voting");
    expect(
      organizerTaskDomain(
        task("/televoting/admin/integrity", "televote_integrity", "televote.integrity.review"),
      ),
    ).toBe("voting");
  });

  it("routes generic integrity and investigations to Governance instead of Voting", () => {
    expect(
      organizerTaskDomain(task("/admin/integrity-cases/024", "integrity_case", "integrity.review")),
    ).toBe("governance");
    expect(
      organizerTaskDomain(task("/admin/investigations/024", "investigation", "investigation.review")),
    ).toBe("governance");
    expect(
      organizerTaskDomain(task("/admin/appeals/3", "appeal", "appeal.review")),
    ).toBe("governance");
  });

  it("does not classify ordinary result or delegation tasks as Governance", () => {
    expect(
      organizerTaskDomain(task("/admin/results", "result_operation", "result.review")),
    ).toBe("results");
    expect(
      organizerTaskDomain(task("/confirmations/admin", "confirmation", "confirmation.review")),
    ).toBe("delegations");
  });
});
