import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/_authenticated/admin/broadcast-rundown.tsx", "utf8");

describe("Organizer Broadcast Rundown actor-bound production reviews", () => {
  it("remounts drafts and partitions private rundown on account/edition/show switches", () => {
    expect(route).toContain("const actorId = useAuthenticatedUser().id;");
    expect(route).toContain("key={\x60\x24{actorId}:");
    expect(route).toContain("queryKey: ['studio2-broadcast-rundown', actorId, editionId, showId]");
    expect(route).toContain("enabled: Boolean(actorId && editionId && selectedShow)");
    expect(route).toContain("gcTime: 0");
    expect(route).toContain("actorIdRef.current = '';");
  });
  it("checks frozen actor before and after asynchronous canonical read, then saves", () => {
    expect(route).toContain("type ReviewedBroadcastContext = {\n  actorId: string;");
    expect(route).toContain("actorIdRef.current !== reviewedActorId");
    expect(route).toContain("reviewedActorId: pendingSegmentReview.actorId");
    expect((route.match(/assertProductionEditionScope\(review.editionId, review.showId, review.actorId\)/g) || []).length).toBeGreaterThanOrEqual(2);
    expect((route.match(/assertProductionEditionScope\(reviewedEditionId, reviewedShowId, reviewedActorId\)/g) || []).length).toBeGreaterThanOrEqual(4);
  });
});
