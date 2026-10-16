import { describe, expect, it } from "vitest";

import { loadOrganizerMediaAssetReviews } from "./v3-organizer-media-review-scope";

function review(editionId: string) {
  return {
    id: "review-1",
    editionId,
    assetKey: "entry:1:artist_photo",
    assetType: "artist_photo" as const,
    countryId: "country-1",
    entryId: "entry-1",
    sourceFingerprint: "fingerprint",
    decision: "approved" as const,
    reason: "Approved for use",
    reviewedBy: "user-1",
    reviewedByName: "Organizer",
    reviewedAt: "2026-10-16T10:00:00Z",
    supersededAt: null,
  };
}

describe("Organizer Media Review exact-edition read boundary", () => {
  it("normalizes and forwards the selected edition", async () => {
    let requested = "";
    const rows = await loadOrganizerMediaAssetReviews(" edition-22 ", async (editionId) => {
      requested = editionId;
      return [review(editionId)];
    });

    expect(requested).toBe("edition-22");
    expect(rows).toHaveLength(1);
  });

  it("rejects cross-edition review history", async () => {
    await expect(
      loadOrganizerMediaAssetReviews("edition-22", async () => [review("edition-21")]),
    ).rejects.toThrow("Media Review returned data outside the selected edition scope.");
  });

  it("fails before any read when edition context is missing", async () => {
    let called = false;
    await expect(
      loadOrganizerMediaAssetReviews("  ", async () => {
        called = true;
        return [];
      }),
    ).rejects.toThrow("Media Review requires an explicit edition scope.");
    expect(called).toBe(false);
  });
});
