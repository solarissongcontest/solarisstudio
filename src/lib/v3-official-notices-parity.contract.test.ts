import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const route = () => read("src/routes/_authenticated/notifications.tsx");
const screen = () => read("src/components/v3/V3NotificationsScreen.tsx");
const detail = () => read("src/components/v3/V3OfficialNoticeDetail.tsx");
const recipientInbox = () => read("src/lib/studio2-recipient-inbox.ts");
const communications = () => read("src/lib/studio2-communications.ts");

describe("V3 official notices parity", () => {
  it("keeps the canonical inbox and receipt mutations server-authoritative", () => {
    const source = route();

    expect(source).toContain("loadStudio2RecipientNoticeInbox(editionId)");
    expect(source).toContain("markStudio2NoticeOpened(id)");
    expect(source).toContain("acknowledgeStudio2InboxNotice(id)");
    expect(source).toContain("archiveStudio2Notice(id, archived)");
    expect(recipientInbox()).toContain('rpc("studio2_my_notice_inbox"');
    expect(communications()).toContain("rpc('studio2_mark_notice_opened'");
    expect(communications()).toContain("rpc('studio2_acknowledge_notice'");
    expect(communications()).toContain("rpc('studio2_archive_notice'");
  });

  it("opens official messages inside V3 instead of sending the normal path back to MySolaris", () => {
    const routeSource = route();
    const screenSource = screen();

    expect(routeSource).toContain("validateSearch");
    expect(routeSource).toContain("noticeId={notice}");
    expect(routeSource).toContain("<V3OfficialNoticeDetail");
    expect(screenSource).toContain('to="/notifications"');
    expect(screenSource).toContain("search={{ notice: item.id }}");
    expect(screenSource).not.toContain('to="/my-solaris/notices"');
  });

  it("fails stale deep links closed instead of reviving cached notice state", () => {
    const source = detail();

    expect(source).toContain('data-v3-official-notice-detail="stale"');
    expect(source).toContain("The deep link is stale for your current account or edition.");
    expect(source).toContain("Solaris will not reopen an old notice from cached browser state.");
  });

  it("explains recipient context and keeps notifications separate from workflow truth", () => {
    const source = detail();

    expect(source).toContain('title="Why am I seeing this?"');
    expect(source).toContain("audienceReason(notice.audience, notice.audienceGroup)");
    expect(source).toContain("Notification delivery is not workflow truth");
    expect(source).toContain('to="/participate"') === false;
  });

  it("does not add browser-owned acknowledgement or rollout authority", () => {
    const combined = [route(), screen(), detail()].join("\n");

    expect(combined).not.toContain("localStorage");
    expect(combined).not.toContain("sessionStorage");
    expect(combined).not.toContain("VITE_SOLARIS_APP_V3_NOTIFICATIONS");
    expect(combined).not.toContain("acknowledged: true");
  });
});
