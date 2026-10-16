import { describe, expect, it } from "vitest";

import {
  deriveV3EntryResubmissionDiff,
  inferV3EntryCorrectionSection,
  type V3EntryVersionEvidence,
} from "./v3-entry";

function version(
  revision: number,
  overrides: Partial<V3EntryVersionEvidence> = {},
): V3EntryVersionEvidence {
  return {
    id: `version-${revision}`,
    revision,
    parentVersionId: revision > 1 ? `version-${revision - 1}` : null,
    source: "canonical_write",
    restoredFromSubmissionVersionId: null,
    artist: "Artist",
    songTitle: "Song",
    recordedAt: `2026-10-${String(10 + revision).padStart(2, "0")}T12:00:00.000Z`,
    reviews: [],
    ...overrides,
  };
}

describe("V3 Entry correction presentation", () => {
  it("treats media-specific wording as media even when the reason also names the artist", () => {
    expect(
      inferV3EntryCorrectionSection("Replace the artist image before resubmitting."),
    ).toBe("media");
  });

  it("maps explicit correction language to a canonical editor section without inventing one for ambiguous text", () => {
    expect(inferV3EntryCorrectionSection("Correct candidate metadata.")).toBe("metadata");
    expect(inferV3EntryCorrectionSection("The composer credit is missing.")).toBe("credits");
    expect(inferV3EntryCorrectionSection("Please correct this before resubmitting.")).toBeNull();
  });
});

describe("V3 Entry resubmission diff", () => {
  it("compares the newest immutable server version with the previous revision", () => {
    const diff = deriveV3EntryResubmissionDiff([
      version(1),
      version(3, { artist: "New Artist", songTitle: "Song" }),
      version(2, { artist: "Old Artist", songTitle: "Song" }),
    ]);

    expect(diff).toEqual({
      previousRevision: 2,
      currentRevision: 3,
      fields: [
        {
          field: "artist",
          label: "Artist",
          previousValue: "Old Artist",
          currentValue: "New Artist",
          changed: true,
        },
        {
          field: "songTitle",
          label: "Song",
          previousValue: "Song",
          currentValue: "Song",
          changed: false,
        },
      ],
    });
  });

  it("returns no comparison when immutable history has no previous revision", () => {
    expect(deriveV3EntryResubmissionDiff([version(1)])).toBeNull();
  });

  it("does not manufacture fields that are absent from the Entry version projection", () => {
    const diff = deriveV3EntryResubmissionDiff([
      version(1, { artist: "A", songTitle: "S" }),
      version(2, { artist: "A", songTitle: "S2" }),
    ]);

    expect(diff?.fields.map((field) => field.field)).toEqual(["artist", "songTitle"]);
  });
});
