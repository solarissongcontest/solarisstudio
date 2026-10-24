import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const route = source("src/routes/_authenticated/admin/shows/$slug.tsx");

describe("V3 Organizer Show Mode production review", () => {
  it("reviews Show Mode changes instead of writing directly from the editor button", () => {
    expect(route).toContain("PendingShowModeReview");
    expect(route).toContain("reviewShowMode");
    expect(route).toContain('onClick={() => void reviewShowMode()}');
    expect(route).toContain('confirmationText={pendingShowModeReview?.showName}');
    expect(route).not.toContain('onClick={() => void saveShowMode()}');
  });

  it("captures exact edition/show identity, canonical version and before-after production state", () => {
    expect(route).toContain("editionId: edition.id");
    expect(route).toContain("showId: showModeTarget.id");
    expect(route).toContain("showName: preview.show.name");
    expect(route).toContain("expectedVersion: preview.expectedVersion");
    expect(route).toContain("before: showModeSnapshot(current)");
    expect(route).toContain("after: showModeSnapshot(next)");
    expect(route).toContain('createShowLifecycleIdentity("show-mode")');
  });

  it("re-runs canonical preflight and refuses stale Show Mode state", () => {
    expect(route).toContain("previewShowLifecycle({ editionId: review.editionId, showId: review.showId })");
    expect(route).toContain("live.expectedVersion !== review.expectedVersion");
    expect(route).toContain("sameShowMode(showModeSnapshot(current), review.before)");
    expect(route).toContain("Show Mode changed while this review was open. Nothing was applied.");
  });

  it("commits through governed Show lifecycle authority and surfaces receipt evidence", () => {
    expect(route).toContain("const result = await updateShowMode({");
    expect(route).toContain("expectedVersion: review.expectedVersion");
    expect(route).toContain("identity: review.identity");
    expect(route).toContain("result.receiptId.slice(0, 8)");
    expect(route).toContain("optimistic versioning, idempotency, audit evidence and operation-receipt reconciliation");
    expect(route).not.toContain("legacy browser-side broadcast configuration write");
    expect(route).not.toContain('supabase.from("shows")');
  });
});
