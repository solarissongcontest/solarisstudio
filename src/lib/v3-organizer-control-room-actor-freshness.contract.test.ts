import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/_authenticated/admin/control-room.tsx", "utf8");

describe("Organizer Control Room actor-bound private reads and critical reviews", () => {
  it("partitions private production queries and invalidations by authenticated actor and edition", () => {
    expect(route).toContain("useAuthenticatedUser().id");
    expect(route).toContain("queryKey: ['studio2-control-room', actorId, editionId ?? 'none']");
    expect(route).toContain("queryKey: ['studio2-transition-approvals', actorId, editionId ?? 'none']");
    expect(route).toContain("queryKey: ['studio2-control-room', actorId, targetEditionId]");
    expect(route).toContain("queryKey: ['studio2-transition-approvals', actorId, targetEditionId]");
    expect(route).toContain("enabled: Boolean(actorId && editionId)");
    expect(route).toContain("gcTime: 0");
    expect(route).toContain("refetchOnWindowFocus: false");
  });

  it("invalidates pending high-risk reviews when the authenticated actor changes", () => {
    expect(route).toContain("}, [editionId, actorId]);");
    expect(route).toContain("actorId: string;");
    expect(route).toContain("actorIdRef.current = actorId;");
    expect(route).toContain("actorIdRef.current !== reviewedActorId || actorId !== reviewedActorId");
    expect(route).toContain("actorIdRef.current !== reviewedActorId ||");
    expect(route).toContain("Organizer account changed after this review opened. Nothing was applied.");
  });

  it("preserves edition/version/approval and incident revalidation immediately before apply", () => {
    expect(route).toContain("studio2ControlRoom.loadSnapshot(reviewedEditionId)");
    expect(route).toContain("studio2ControlRoom.listTransitionApprovals(reviewedEditionId)");
    expect(route).toContain("freshSnapshot.runtime.version !== pendingReview.runtimeVersion");
    expect(route).toContain("liveIncident.status !== pendingReview.from");
  });
});
