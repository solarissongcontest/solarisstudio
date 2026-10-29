import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/components/v3/V3OfficialNoticesRouteContent.tsx", "utf8");
const screen = readFileSync("src/components/v3/V3OfficialNoticesScreen.tsx", "utf8");

describe("V3 official notices route", () => {
  it("keeps official notices separate from generic notifications", () => {
    expect(route).toContain("loadStudio2RecipientNoticeInbox");
    expect(route).toContain('to="/notifications"');
    expect(screen).toContain("Official Solaris messages for your delegation");
  });

  it("uses canonical acknowledgement/read/archive mutations and reconciles failures", () => {
    expect(route).toContain("markStudio2NoticeOpened");
    expect(route).toContain("acknowledgeStudio2InboxNotice");
    expect(route).toContain("archiveStudio2Notice");
    expect(route).toContain("onError: () => refresh()");
    expect(screen).toContain("Solaris has not assumed the operation succeeded");
  });

  it("covers loading, unavailable, error, stale-link and empty states", () => {
    expect(screen).toContain("Official notices are unavailable");
    expect(screen).toContain("Loading official notices");
    expect(screen).toContain("The delegation inbox could not be loaded");
    expect(screen).toContain("This notice is no longer available");
    expect(screen).toContain("No notices in this view");
  });
});
