import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const route = source("src/routes/_authenticated/my-solaris/notices.tsx");
const organizerModule = source(
  "src/components/mysolaris/modules/OrganizerPublicNoticesModule.tsx",
);
const workspaceContext = source("src/components/mysolaris/MySolarisContext.tsx");

describe("organizer public notifications", () => {
  it("routes organizer accounts to a read-only public notice view", () => {
    expect(route).toContain("account.data?.access.isOrganizer");
    expect(route).toContain("<OrganizerPublicNoticesModule />");
    expect(organizerModule).toContain("loadPublicHomeAnnouncements(10)");
    expect(organizerModule).toContain('title="Public notifications"');
    expect(organizerModule).toContain("never creates delegation read or acknowledgement receipts");
  });

  it("does not use delegation receipt mutation APIs for organizers", () => {
    expect(organizerModule).not.toContain("loadStudio2NoticeInbox");
    expect(organizerModule).not.toContain("markStudio2NoticeOpened");
    expect(organizerModule).not.toContain("acknowledgeStudio2InboxNotice");
    expect(organizerModule).not.toContain("archiveStudio2Notice");
  });

  it("uses public announcements rather than delegation inbox state for organizer badges", () => {
    expect(workspaceContext).toContain('isOrganizer ? "organizer-public" : "delegation-inbox"');
    expect(workspaceContext).toContain("loadPublicHomeAnnouncements(10)");
    expect(workspaceContext).toContain("acknowledgementTasks: 0");
    expect(workspaceContext).toContain("acknowledgedNotices: 0");
  });
});
