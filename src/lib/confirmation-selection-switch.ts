import type { ConfirmationPayload, SelectionMethod } from "@/lib/ssc";

export type SelectionSong = Pick<
  ConfirmationPayload,
  | "artist"
  | "song_title"
  | "song_url"
  | "credits"
  | "preview_start"
  | "preview_end"
  | "final_clip_start"
  | "final_clip_end"
  | "replacement_video_required"
  | "replacement_video_url"
>;

export type SelectionSongCache = Partial<Record<"internal" | "national_final", SelectionSong>>;

export const emptySelectionSong = (): SelectionSong => ({
  artist: "",
  song_title: "",
  song_url: "",
  credits: [],
  preview_start: "",
  preview_end: "",
  final_clip_start: "",
  final_clip_end: "",
  replacement_video_required: false,
  replacement_video_url: "",
});

export function readSelectionSong(payload: ConfirmationPayload): SelectionSong {
  return {
    artist: payload.artist,
    song_title: payload.song_title,
    song_url: payload.song_url,
    credits: [...payload.credits],
    preview_start: payload.preview_start,
    preview_end: payload.preview_end,
    final_clip_start: payload.final_clip_start,
    final_clip_end: payload.final_clip_end,
    replacement_video_required: payload.replacement_video_required,
    replacement_video_url: payload.replacement_video_url,
  };
}

/**
 * The legacy Confirmation wire format shares one song field group between
 * Internal and National Final winner details. Keep a separate private form
 * snapshot for each method while editing, without altering the canonical RPC
 * payload or leaking the inactive method through public projections.
 *
 * Historical DB rows are preserved by the forward-only method-switch migration.
 */
export function switchConfirmationSelectionMethod(
  current: ConfirmationPayload,
  next: SelectionMethod,
  cache: SelectionSongCache,
): { payload: ConfirmationPayload; cache: SelectionSongCache } {
  const nextCache = { ...cache };
  if (current.selection_method === "internal" || current.selection_method === "national_final") {
    nextCache[current.selection_method] = readSelectionSong(current);
  }
  return {
    cache: nextCache,
    payload: {
      ...current,
      ...(next === "internal" || next === "national_final"
        ? nextCache[next] ?? emptySelectionSong()
        : emptySelectionSong()),
      selection_method: next,
    },
  };
}
