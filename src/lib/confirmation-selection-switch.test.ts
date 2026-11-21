import { describe, expect, it } from "vitest";
import { emptyPayload } from "./ssc";
import {
  readSelectionSong,
  switchConfirmationSelectionMethod,
} from "./confirmation-selection-switch";
import { prefillSelectionSongCache } from "./prefill";

const initial = () => ({
  ...emptyPayload("00000000-0000-4000-8000-000000000012"),
  country: "Abeven",
  instagram_username: "abeven",
  participating: true,
  selection_method: "internal" as const,
  artist: "Original internal artist",
  song_title: "Original internal song",
  song_url: "https://example.invalid/internal",
  preview_start: "00:15",
  reveal_date_type: "unknown" as const,
  nf_name: "National Final history",
  nf_entries: [
    { artist: "NF artist", song_title: "NF song", song_url: "https://example.invalid/nf" },
  ],
});

describe("Confirmation selection switching", () => {
  it("does not clear the unrelated NF candidate list, reveal date, country or round", () => {
    const original = initial();
    const switched = switchConfirmationSelectionMethod(original, "national_final", {});
    expect(switched.payload.selection_method).toBe("national_final");
    expect(switched.payload.artist).toBe("");
    expect(switched.payload.nf_entries).toEqual(original.nf_entries);
    expect(switched.payload.nf_name).toBe(original.nf_name);
    expect(switched.payload.reveal_date_type).toBe("unknown");
    expect(switched.payload.country).toBe(original.country);
    expect(switched.payload.round_id).toBe(original.round_id);
  });

  it("restores the original Internal song after NF and back without losing either method", () => {
    const first = switchConfirmationSelectionMethod(initial(), "national_final", {});
    const editedNf = {
      ...first.payload,
      artist: "NF winner",
      song_title: "NF winning song",
      song_url: "https://example.invalid/winner",
    };
    const second = switchConfirmationSelectionMethod(editedNf, "internal", first.cache);
    expect(second.payload.artist).toBe("Original internal artist");
    expect(second.payload.song_title).toBe("Original internal song");
    expect(second.payload.preview_start).toBe("00:15");
    const third = switchConfirmationSelectionMethod(second.payload, "national_final", second.cache);
    expect(third.payload.artist).toBe("NF winner");
    expect(third.payload.song_title).toBe("NF winning song");
    expect(third.payload.nf_entries).toEqual(initial().nf_entries);
  });

  it("prefills both method snapshots from a previously submitted Confirmation", () => {
    const saved = {
      selection_method: "national_final",
      internal_entries: { artist: "Archived artist", song_title: "Archived song", credits: [] },
      national_finals: {
        winning_entry_id: "nf-winner",
        national_final_entries: [
          { id: "nf-winner", artist: "Reviewed winner", song_title: "Reviewed song", credits: [] },
        ],
      },
    };
    const cache = prefillSelectionSongCache(saved);
    expect(cache.internal?.artist).toBe("Archived artist");
    expect(cache.national_final?.artist).toBe("Reviewed winner");
    const nfPayload = {
      ...initial(),
      selection_method: "national_final" as const,
      ...cache.national_final,
    };
    const updated = switchConfirmationSelectionMethod(nfPayload, "internal", cache);
    expect(readSelectionSong(updated.payload).artist).toBe("Archived artist");
    expect(updated.payload.artist).not.toBe("Reviewed winner");
  });

  it("does not confuse pending NF intent with a reviewed winner during prefill", () => {
    const cache = prefillSelectionSongCache({
      national_finals: {
        winning_entry_id: null,
        pending_winning_entry_id: "pending-id",
        national_final_entries: [
          { id: "pending-id", artist: "Pending candidate", song_title: "Review needed" },
        ],
      },
    });
    expect(cache.national_final?.artist).toBe("Pending candidate");
  });
});
