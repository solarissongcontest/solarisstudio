import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const route = readFileSync(
  "src/routes/_authenticated/admin/communications.tsx",
  "utf8",
);
const api = readFileSync("src/lib/studio2-communications.ts", "utf8");

describe("V3 Organizer communications review boundaries", () => {
  it("does not use native browser confirmation for consequential lifecycle actions", () => {
    expect(route).toContain("AdminConfirmSheet");
    expect(route).not.toContain("window.confirm");
    expect(route).toContain("setPublishReviewOpen(true)");
    expect(route).toContain("requestCancel(notice)");
    expect(route).toContain("requestArchive(notice)");
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

  it("makes cancel, archive and permanent deletion consequences explicit", () => {
    expect(route).toContain("Cancelling stops this draft or scheduled communication from publishing");
    expect(route).toContain("Archiving removes the communication from all live destinations");
    expect(route).toContain("Permanent deletion cannot be undone");
    expect(route).toContain("minimal private deletion audit record remains");
    expect(route).toContain("confirmationText={lifecycleReview?.kind === 'delete' ? lifecycleReview.notice.title : undefined}");
    expect(route).toContain("Delete communication permanently");
  });

  it("keeps the existing server lifecycle authority while System #599 owns canonical operation semantics", () => {
    expect(route).toContain("System #599");
    expect(api).toContain("studio2_publish_notice");
    expect(api).toContain("studio2_archive_communication");
    expect(api).toContain("studio2_delete_communication");
    expect(route).not.toContain("studio2_claim_operation");
  });
});
