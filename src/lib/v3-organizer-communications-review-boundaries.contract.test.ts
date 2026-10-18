import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const route = readFileSync(
  "src/routes/_authenticated/admin/communications.tsx",
  "utf8",
);
const api = readFileSync("src/lib/studio2-communications.ts", "utf8");

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

  it("keeps the existing server lifecycle authority while System #599 owns canonical operation semantics", () => {
    expect(route).toContain("System #599");
    expect(api).toContain("studio2_publish_notice");
    expect(api).toContain("studio2_schedule_notice");
    expect(api).toContain("studio2_archive_communication");
    expect(api).toContain("studio2_restore_communication");
    expect(api).toContain("studio2_delete_communication");
    expect(route).not.toContain("studio2_claim_operation");
  });
});
