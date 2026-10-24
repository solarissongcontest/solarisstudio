import { describe, expect, it } from "vitest";

import type { V3EntryMediaAuthorityProjection } from "./v3-entry-media-authority";
import {
  participantEntryMediaAsset,
  presentV3EntryMediaAsset,
  validateV3EntryMediaSelection,
  V3_ENTRY_MEDIA_MAX_BYTES,
} from "./v3-entry-media-participant";

function projection(): V3EntryMediaAuthorityProjection {
  return {
    entryId: "entry-1",
    editionId: "edition-1",
    countryId: "country-1",
    serverTime: "2026-10-23T18:00:00Z",
    assets: [
      {
        assetKey: "artist_photo",
        assetType: "artist_photo",
        state: "accepted",
        reason: null,
        sourceFingerprint: "artist-source",
        updatedAt: "2026-10-23T17:55:00Z",
      },
      {
        assetKey: "cover_artwork",
        assetType: "cover_artwork",
        state: "replacement_required",
        reason: "Please upload artwork without the temporary watermark.",
        sourceFingerprint: "cover-source",
        updatedAt: "2026-10-23T17:56:00Z",
      },
    ],
  };
}

describe("participant Entry media presentation", () => {
  it("accepts only the same verified image family and byte bound as System authority", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      expect(validateV3EntryMediaSelection({ type, size: 100_000 })).toBeNull();
    }

    expect(validateV3EntryMediaSelection({ type: "image/gif", size: 100_000 })).toBe(
      "Choose a JPEG, PNG or WebP image.",
    );
    expect(validateV3EntryMediaSelection({ type: "image/png", size: 0 })).toBe(
      "Choose a non-empty image file.",
    );
    expect(
      validateV3EntryMediaSelection({ type: "image/png", size: V3_ENTRY_MEDIA_MAX_BYTES + 1 }),
    ).toBe("The image must be 5 MB or smaller.");
  });

  it("selects exact media slots from caller-scoped projection evidence", () => {
    const current = projection();
    expect(participantEntryMediaAsset(current, "artist_photo")?.sourceFingerprint).toBe(
      "artist-source",
    );
    expect(participantEntryMediaAsset(current, "cover_artwork")?.sourceFingerprint).toBe(
      "cover-source",
    );
  });

  it("keeps missing media distinct from validation or acceptance", () => {
    expect(presentV3EntryMediaAsset(null)).toEqual({
      state: "missing",
      label: "Not uploaded",
      detail: "No current source is attached to this slot.",
      attention: "neutral",
    });
  });

  it("uses server-safe reasons for accepted and replacement-required evidence", () => {
    const current = projection();
    expect(
      presentV3EntryMediaAsset(participantEntryMediaAsset(current, "artist_photo")),
    ).toMatchObject({ state: "accepted", label: "Accepted", attention: "success" });
    expect(
      presentV3EntryMediaAsset(participantEntryMediaAsset(current, "cover_artwork")),
    ).toEqual({
      state: "replacement_required",
      label: "Replacement required",
      detail: "Please upload artwork without the temporary watermark.",
      attention: "danger",
    });
  });

  it("does not turn processing or validation into a fake accepted state", () => {
    expect(
      presentV3EntryMediaAsset({
        assetKey: "artist_photo",
        assetType: "artist_photo",
        state: "validating",
        reason: null,
        sourceFingerprint: "current",
        updatedAt: "2026-10-23T18:00:00Z",
      }),
    ).toMatchObject({ state: "validating", attention: "working" });
  });
});
