import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const route = readFileSync(
  "src/routes/_authenticated/admin/communications.tsx",
  "utf8",
);
const adapter = readFileSync("src/lib/v3-organizer-communications.ts", "utf8");
const lifecycleCommands = readFileSync(
  "src/lib/v3-official-communications-commands.ts",
  "utf8",
);
const draftCommands = readFileSync(
  "src/lib/v3-official-communications-draft-commands.ts",
  "utf8",
);

describe("V3 Organizer communications review boundaries", () => {
  it("does not use native browser dialogs for consequential lifecycle actions", () => {
    expect(route).toContain("AdminConfirmSheet");
    expect(route).not.toContain("window.confirm");
    expect(route).not.toContain("window.prompt");
    expect(route).toContain("setPublishReviewOpen(true)");
    expect(route).toContain("setScheduleReviewOpen(true)");
    expect(route).toContain("requestCancel(notice)");
    expect(route).toContain("requestArchive(notice)");
    expect(route).toContain("requestRestore(notice)");
    expect(route).toContain("requestDelete(notice)");
  });

  it("previews the exact publication audience and destinations before publishing", () => {
    expect(route).toContain('title="Publish this communication now?"');
    expect(route).toContain("Review the exact message, destinations and audience before it becomes live");
    expect(route).toContain("displaySurfaces.map(noticeSurfaceLabel).join(', ')");
    expect(route).toContain("Inbox audience:");
    expect(route).toContain("Acknowledgement:");
    expect(route).toContain('confirmLabel="Publish communication now"');
  });

  it("reviews scheduled publication before handing it to the server scheduler", () => {
    expect(route).toContain('title="Schedule this communication?"');
    expect(route).toContain("Review the exact publication time, message, destinations and audience before scheduling");
    expect(route).toContain("formatScheduledInput(scheduledAt)");
    expect(route).toContain("without another Organizer action");
    expect(route).toContain('confirmLabel="Schedule communication"');
    expect(route).not.toContain("onClick={() => scheduleNotice.mutate()}");
  });

  it("collects lifecycle reasons inside the same exact consequence review", () => {
    expect(route).toContain("Organizer reason");
    expect(route).toContain("value={lifecycleReview.reason}");
    expect(route).toContain("setLifecycleReview((current) => current ? { ...current, reason: event.target.value } : current)");
    expect(route).toContain("const reason = lifecycleReview.reason.trim()");
    expect(route).toContain("lifecycleReview?.kind === 'delete' && !lifecycleReview.reason.trim()");
  });

  it("makes cancel, archive, restore and permanent deletion consequences explicit", () => {
    expect(route).toContain("Cancelling stops this draft or scheduled communication from publishing");
    expect(route).toContain("Archiving removes the communication from all live destinations");
    expect(route).toContain("Restoring republishes this archived communication to its original destinations");
    expect(route).toContain("requestRestore(selectedNotice)");
    expect(route).not.toContain("onClick={() => restoreCommunication.mutate(");
    expect(route).toContain("Permanent deletion cannot be undone");
    expect(route).toContain("minimal private deletion audit record remains");
    expect(route).toContain("confirmationText={lifecycleReview?.kind === 'delete' ? lifecycleReview.notice.title : undefined}");
    expect(route).toContain("Delete communication permanently");
  });

  it("freezes the reviewed revision instead of silently adopting a background refetch", () => {
    expect(route).toContain("const [editingBase, setEditingBase] = useState<OperationalNotice | null>(null)");
    expect(route).toContain("updateOrganizerNoticeDraft(editingBase, currentInput())");
    expect(route).toContain("setLifecycleReview({ kind: 'archive', notice, reason: '' })");
    expect(adapter).toContain("expectedRevision: notice.revision");
    expect(adapter).toContain("preflight.currentRevision !== notice.revision");
    expect(adapter).toContain("reviewedNotice.revision");
  });

  it("cuts Organizer mutations over to the governed V3 command family", () => {
    expect(route).toContain("@/lib/v3-organizer-communications");
    expect(route).toContain("createOrganizerNoticeDraft");
    expect(route).toContain("updateOrganizerNoticeDraft");
    expect(route).toContain("scheduleOrganizerNotice");
    expect(route).toContain("publishOrganizerNotice");
    expect(route).toContain("cancelOrganizerNotice");
    expect(route).toContain("archiveOrganizerCommunication");
    expect(route).toContain("restoreOrganizerCommunication");
    expect(route).toContain("deleteOrganizerCommunication");
    expect(route).not.toContain("publishStudio2Notice");
    expect(route).not.toContain("scheduleStudio2Notice");
    expect(route).not.toContain("deleteStudio2Communication");

    expect(adapter).toContain("preflightV3NoticeLifecycle(intent)");
    expect(adapter).toContain("executeV3NoticeLifecycle(intent)");
    expect(adapter).toContain("createV3NoticeDraft");
    expect(adapter).toContain("updateV3NoticeDraft");
    expect(adapter).toContain("createV3SupersedingNoticeDraft");
    expect(lifecycleCommands).toContain('"v3_execute_notice_lifecycle"');
    expect(draftCommands).toContain('"v3_update_notice_draft"');
  });

  it("keeps exact edition scope and authoritative deletion evidence fail closed", () => {
    expect(adapter).toContain('return { scopeKind: "edition" as const, editionId: normalized }');
    expect(adapter).toContain("Official Communications command crossed edition scope");
    expect(adapter).toContain("Permanent communication deletion requires an Organizer reason");
    expect(adapter).toContain("Permanent communication deletion did not return authoritative deletion evidence");
    expect(route).toContain("exact-edition scope, revision checks, idempotency, receipts and lost-response reconciliation");
  });
});
