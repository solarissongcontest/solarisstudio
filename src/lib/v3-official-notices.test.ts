import { describe, expect, it } from "vitest";

import type { OperationalNotice } from "./official-communications";
import {
  parseV3OfficialNoticeFilter,
  v3OfficialNoticeNeedsAction,
  v3OfficialNoticeReason,
  v3OfficialNoticeResolved,
} from "./v3-official-notices";

function notice(
  overrides: Partial<OperationalNotice> = {},
): OperationalNotice {
  return {
    id: "notice-1",
    editionId: "edition-1",
    noticeType: "official_notice",
    title: "Delegation update",
    body: "Read this update.",
    severity: "info",
    audience: "all_delegations",
    audienceGroup: null,
    countryIds: [],
    acknowledgementRequired: false,
    displaySurfaces: ["delegation_inbox"],
    state: "published",
    scheduledAt: null,
    sentAt: "2026-10-17T12:00:00Z",
    cancelledAt: null,
    archivedAt: null,
    supersededById: null,
    revision: 1,
    ...overrides,
  };
}

describe("V3 official notice presentation model", () => {
  it("accepts only canonical inbox filter states", () => {
    expect(parseV3OfficialNoticeFilter("unread")).toBe("unread");
    expect(parseV3OfficialNoticeFilter("acknowledgement_required")).toBe(
      "acknowledgement_required",
    );
    expect(parseV3OfficialNoticeFilter("deleted")).toBeUndefined();
    expect(parseV3OfficialNoticeFilter(null)).toBeUndefined();
  });

  it("treats required acknowledgement as action without conflating ordinary unread state", () => {
    const required = notice({ acknowledgementRequired: true });
    const informational = notice({ acknowledgementRequired: false });

    expect(v3OfficialNoticeNeedsAction(required, "acknowledgement_required")).toBe(true);
    expect(v3OfficialNoticeNeedsAction(required, "unread")).toBe(true);
    expect(v3OfficialNoticeNeedsAction(required, "acknowledged")).toBe(false);
    expect(v3OfficialNoticeNeedsAction(informational, "unread")).toBe(false);
  });

  it("derives recipient explanation from canonical audience metadata", () => {
    expect(v3OfficialNoticeReason(notice({ audience: "all_delegations" }))).toContain(
      "all delegations",
    );
    expect(
      v3OfficialNoticeReason(
        notice({ audience: "specific_countries", countryIds: ["country-1"] }),
      ),
    ).toContain("including yours");
    expect(
      v3OfficialNoticeReason(
        notice({ audience: "edition_group", audienceGroup: "voting" }),
      ),
    ).toContain("voting recipient group");
  });

  it("derives resolved presentation from confirmed inbox state", () => {
    expect(v3OfficialNoticeResolved("read")).toBe(true);
    expect(v3OfficialNoticeResolved("acknowledged")).toBe(true);
    expect(v3OfficialNoticeResolved("archived")).toBe(true);
    expect(v3OfficialNoticeResolved("unread")).toBe(false);
    expect(v3OfficialNoticeResolved("acknowledgement_required")).toBe(false);
  });
});
