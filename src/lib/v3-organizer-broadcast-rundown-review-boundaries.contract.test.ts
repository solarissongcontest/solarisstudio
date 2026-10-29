import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const route = readFileSync(
  "src/routes/_authenticated/admin/broadcast-rundown.tsx",
  "utf8",
);
const adapter = readFileSync("src/lib/studio2-broadcast-rundown.ts", "utf8");

describe("V3 Organizer Broadcast Rundown production review boundaries", () => {
  it("binds show selection into shell-owned OrganizerContext without silently substituting a show", () => {
    expect(route).toContain("showId: contextShowId");
    expect(route).toContain("setShowContext");
    expect(route).toContain("setShowContext(nextShow ? { id: nextShow.id, label: nextShow.name } : null)");
    expect(route).toContain('<option value="">Choose show…</option>');
    expect(route).toContain('title="Choose a show"');
    expect(route).not.toContain("setShowId(shows[0]");
    expect(route).not.toContain("useState('')");
  });

  it("keeps consequential production input inside Organizer review sheets", () => {
    expect(route).toContain("AdminConfirmSheet");
    expect(route).not.toContain("window.confirm");
    expect(route).not.toContain("window.prompt");
    expect(route).toContain("Operator reason");
    expect(route).toContain("At least 5 characters");
    expect(route).toContain("confirmDisabled={!pendingStructureReview || pendingStructureReview.reason.trim().length < 5}");
    expect(route).toContain("confirmDisabled={!pendingLockReview || pendingLockReview.reason.trim().length < 5}");
    expect(route).toContain("confirmDisabled={!pendingSegmentReview || pendingSegmentReview.reason.trim().length < 5}");
  });

  it("freezes exact edition, show, revision and structure before production save review", () => {
    expect(route).toContain("type PendingStructureReview = ReviewedBroadcastContext");
    expect(route).toContain("editionId,");
    expect(route).toContain("editionLabel: currentEditionLabel");
    expect(route).toContain("showId: selectedShow.id");
    expect(route).toContain("showName: selectedShow.name");
    expect(route).toContain("revision: draft.revision");
    expect(route).toContain("config: cloneRundownConfig(draft)");
    expect(route).toContain("Save this production rundown structure?");
    expect(route).toContain("Save reviewed structure");
    expect(route).toContain("pendingStructureReview.editionLabel} · {pendingStructureReview.showName");
  });

  it("re-reads canonical rundown state and fails closed before reviewed structure save", () => {
    expect(route).toContain("assertProductionEditionScope(review.editionId, review.showId)");
    expect(route).toContain("review.config.revision !== review.revision");
    expect(route).toContain("const live = await loadStudio2BroadcastRundown(review.showId)");
    expect(route).toContain("const liveRevision = live?.revision ?? 0");
    expect(route).toContain("liveRevision !== review.revision");
    expect(route).toContain("The canonical rundown revision changed while the structure review was open.");
    expect(route).toContain("saveStudio2BroadcastRundown(");
    expect(route).toContain("review.reason");
    expect(route).not.toContain("onClick={() => saveMutation.mutate()}");
  });

  it("captures exact Organizer context before production lock review", () => {
    expect(route).toContain("editionLabel: currentEditionLabel");
    expect(route).toContain("showName: selectedShow.name");
    expect(route).toContain("revision: draft.revision");
    expect(route).toContain("Lock this rundown for execution?");
    expect(route).toContain("Unlock this rundown for editing?");
    expect(route).toContain("Reviewed rundown revision {pendingLockReview.revision}");
    expect(route).toContain("pendingLockReview.editionLabel} · {pendingLockReview.showName");
    expect(route).toContain("pendingLockReview.reason.trim()");
  });

  it("re-reads canonical rundown state and fails closed before a reviewed lock mutation", () => {
    expect(route).toContain("assertProductionEditionScope(reviewedEditionId, reviewedShowId)");
    expect(route).toContain("const live = await loadStudio2BroadcastRundown(reviewedShowId)");
    expect(route).toContain("live.revision !== revision");
    expect(route).toContain("The rundown revision changed while the lock review was open.");
    expect(route).toContain("setStudio2BroadcastRundownLock(reviewedShowId, live, locked, reason)");
    expect(route).toContain("Nothing was changed. Reload the canonical rundown and review the command again.");
  });

  it("rechecks exact edition, show, revision and segment state before production transition", () => {
    expect(route).toContain("reviewedEditionId: pendingSegmentReview.editionId");
    expect(route).toContain("reviewedShowId: pendingSegmentReview.showId");
    expect(route).toContain("reviewedRevision: pendingSegmentReview.revision");
    expect(route).toContain("reviewedStatus: pendingSegmentReview.segment.status");
    expect(route).toContain("assertProductionEditionScope(reviewedEditionId, reviewedShowId)");
    expect(route).toContain("liveSegment?.status !== reviewedStatus");
    expect(route).toContain("The rundown or segment state changed while the transition review was open.");
    expect(route).toContain("pendingSegmentReview.editionLabel} · {pendingSegmentReview.showName");
    expect(route).toContain("Apply production transition");
    expect(route).toContain("Solaris re-reads the canonical rundown");
  });

  it("keeps rehearsal local and preserves revision-aware server authority", () => {
    expect(route).toContain("if (mode === 'rehearsal')");
    expect(route).toContain("Rehearsal preview: ${action}");
    expect(adapter).toContain("setStudio2BroadcastRundownLock");
    expect(adapter).toContain("transitionStudio2BroadcastSegment");
    expect(adapter).toContain("p_expected_revision: config.revision");
    expect(adapter).toContain("if (mode === 'rehearsal') return rehearseStudio2BroadcastTransition");
  });

  it("discards pending production reviews when show or mode context changes", () => {
    expect(route).toContain("setPendingStructureReview(null)");
    expect(route).toContain("setPendingLockReview(null)");
    expect(route).toContain("setPendingSegmentReview(null)");
    expect(route).toContain("[showId, mode]");
  });
});
