import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const route = () => read("src/routes/_authenticated/my-solaris/notices.tsx");
const content = () => read("src/components/v3/V3OfficialNoticesRouteContent.tsx");
const actions = () => read("src/lib/v3-official-notice-actions.ts");
const screen = () => read("src/components/v3/V3OfficialNoticesScreen.tsx");
const notifications = () => read("src/components/v3/V3NotificationsScreen.tsx");

describe("V3 official delegation notices", () => {
  it("cuts over only eligible installed-app users and preserves Organizer plus legacy ownership", () => {
    const source = route();

    expect(source).toContain("useV3RolloutProbe(platformResolved && isAppMode)");
    expect(source).toContain("rollout.data?.notificationsEnabled === true");
    expect(source).toContain("<V3OfficialNoticesRouteContent");
    expect(source).toContain("<OrganizerRecipientNoticesModule />");
    expect(source).toContain("<OrganizerPublicNoticesModule />");
    expect(source).toContain("return <MySolarisNoticesModule />");
    expect(source).toContain("parseV3OfficialNoticeFilter(search.state)");
  });

  it("shares the recipient-scoped read truth used by V3 Notifications", () => {
    const source = content();

    expect(source).toContain("loadStudio2RecipientNoticeInbox(editionId)");
    expect(source).toContain('["v3-delegation-notices", userId, editionId ?? "current"]');
    expect(source).toContain('["v3-notifications-inbox", userId, editionId ?? "current"]');
    expect(source).not.toContain("loadStudio2NoticeInbox");
    expect(source).not.toContain("refetchInterval");
    expect(source).not.toContain("from(\"");
  });

  it("keeps mark-open, acknowledgement and archive on authoritative receipt RPCs with the active edition scope", () => {
    const workflow = content();
    const adapter = actions();

    expect(workflow).toContain("markV3OfficialNoticeOpened(noticeId, editionId)");
    expect(workflow).toContain("acknowledgeV3OfficialNotice(noticeId, editionId)");
    expect(workflow).toContain("archiveV3OfficialNotice(noticeId, archived, editionId)");
    expect(adapter).toContain('isStudio2FeatureEnabled("official_communications", editionId)');
    expect(adapter).toContain('"studio2_mark_notice_opened"');
    expect(adapter).toContain('"studio2_acknowledge_notice"');
    expect(adapter).toContain('"studio2_archive_notice"');
    expect(workflow).not.toContain("onMutate:");
    expect(workflow).not.toContain("optimistic");
  });

  it("does not drop an unread receipt when another notice is still being marked open", () => {
    const source = content();

    expect(source).toContain("openingIdsRef = useRef(new Set<string>())");
    expect(source).toContain("!openingIdsRef.current.has(noticeId)");
    expect(source).toContain("markOpened.mutateAsync(noticeId)");
    expect(source).toContain("openingIdsRef.current.delete(noticeId)");
    expect(source).not.toContain("!markOpened.isPending");
  });

  it("reconciles uncertain mutation outcomes against receipt evidence", () => {
    const workflow = content();
    const presentation = screen();

    expect(workflow).toMatch(/acknowledge = useMutation\([\s\S]*onError: \(\) => refresh\(\)/);
    expect(workflow).toMatch(/archive = useMutation\([\s\S]*onError: \(\) => refresh\(\)/);
    expect(workflow).toContain("!selected?.receipt?.acknowledgedAt");
    expect(workflow).toContain("!selected.receipt?.archivedAt");
    expect(workflow).toContain("!selected?.receipt?.openedAt");
    expect(presentation).toContain("The inbox still reflects the last confirmed server state");
  });

  it("records opening from receipt evidence rather than treating acknowledgement-required as already read", () => {
    const source = content();

    expect(source).toContain("!item.receipt?.openedAt");
    expect(source).toContain("markOpened.mutateAsync(noticeId)");
    expect(source).not.toContain('item.inboxState === "unread"');
  });

  it("explains recipient reason and keeps reading separate from acknowledgement", () => {
    const source = screen();

    expect(source).toContain("Why am I seeing this?");
    expect(source).toContain("v3OfficialNoticeReason(notice)");
    expect(source).toContain("Reading this notice does not acknowledge it");
    expect(source).toContain("Acknowledgement recorded");
    expect(source).toContain('data-v3-official-notice-detail={notice.id}');
  });

  it("handles stale notice deep links without inventing a successful state", () => {
    const source = screen();

    expect(source).toContain("This notice is no longer available");
    expect(source).toContain("No action was taken");
  });

  it("keeps the Notifications summary mutation-free and links into the canonical notice workflow", () => {
    const source = notifications();

    expect(source).toContain('to="/my-solaris/notices"');
    expect(source).not.toContain("acknowledgeStudio2InboxNotice");
    expect(source).not.toContain("markStudio2NoticeOpened");
    expect(source).not.toContain("archiveStudio2Notice");
  });
});
