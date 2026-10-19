import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const route = readFileSync(
  "src/routes/_authenticated/admin/broadcast-rundown.tsx",
  "utf8",
);
const adapter = readFileSync("src/lib/studio2-broadcast-rundown.ts", "utf8");

describe("V3 Organizer Broadcast Rundown production review boundaries", () => {
  it("replaces native browser confirmation with Organizer review sheets", () => {
    expect(route).toContain("AdminConfirmSheet");
    expect(route).not.toContain("window.confirm");
    expect(route).toContain("setPendingLockReview({ locked, reason })");
    expect(route).toContain("setPendingSegmentReview({ segment, status, reason })");
  });

  it("reviews show, revision, reason and lock consequence before production lock changes", () => {
    expect(route).toContain("Lock this rundown for execution?");
    expect(route).toContain("Unlock this rundown for editing?");
    expect(route).toContain("Rundown revision {draft?.revision ?? 'unknown'}");
    expect(route).toContain("{selectedShow?.name ?? 'Selected show'}");
    expect(route).toContain("pendingLockReview.reason");
    expect(route).toContain("Locking freezes structural edits for this rundown");
    expect(route).toContain("Unlocking re-enables structural editing");
  });

  it("reviews the exact production segment state transition before applying it", () => {
    expect(route).toContain("pendingSegmentReview.segment.status");
    expect(route).toContain("pendingSegmentReview.status");
    expect(route).toContain("pendingSegmentReview.reason");
    expect(route).toContain("Apply production transition");
    expect(route).toContain("This changes production rundown state and is audited");
  });

  it("keeps rehearsal local and preserves the existing revision-aware server authority", () => {
    expect(route).toContain("if (mode === 'rehearsal')");
    expect(route).toContain("Rehearsal preview: ${action}");
    expect(adapter).toContain("setStudio2BroadcastRundownLock");
    expect(adapter).toContain("transitionStudio2BroadcastSegment");
    expect(adapter).toContain("if (mode === 'rehearsal') return rehearseStudio2BroadcastTransition");
  });

  it("discards pending production reviews when show or mode context changes", () => {
    expect(route).toContain("setPendingLockReview(null)");
    expect(route).toContain("setPendingSegmentReview(null)");
    expect(route).toContain("[showId, mode]");
  });
});
