import type {
  ConfirmationPayload,
  DateType,
} from "@/lib/ssc";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function prefillFromSubmission(
  s: any,
  base: ConfirmationPayload,
): ConfirmationPayload {
  const internal = s.internal_entries ?? null;
  const nf = s.national_finals ?? null;

  const allNfEntries = (nf?.national_final_entries ?? [])
    .slice()
    .sort(
      (a: { position?: number | null }, b: { position?: number | null }) =>
        (a.position ?? 0) - (b.position ?? 0),
    );

  const editableNfEntries = allNfEntries.filter(
    (entry: { removed?: boolean | null }) => entry.removed !== true,
  );

  const winningEntry = nf?.winning_entry_id
    ? allNfEntries.find((entry: { id?: string }) => entry.id === nf.winning_entry_id) ?? null
    : null;

  const isNationalFinal = s.selection_method === "national_final";
  const mainSong = isNationalFinal ? winningEntry : internal;

  return {
    ...base,
    round_id: s.round_id ?? base.round_id,
    instagram_username: s.instagram_username ?? base.instagram_username,
    country: s.country ?? base.country,
    has_country_account: s.has_country_account ?? false,
    country_account: s.country_account ?? "",
    participating: s.participating ?? true,
    selection_method: (s.selection_method ?? "") as ConfirmationPayload["selection_method"],
    entry_unknown: s.entry_unknown ?? false,
    nf_entries_unknown: s.nf_entries_unknown ?? false,
    artist: mainSong?.artist ?? "",
    song_title: mainSong?.song_title ?? "",
    song_url: mainSong?.song_url ?? "",
    preview_start: mainSong?.preview_start ?? "",
    preview_end: mainSong?.preview_end ?? "",
    final_clip_start: mainSong?.final_clip_start ?? "",
    final_clip_end: mainSong?.final_clip_end ?? "",
    replacement_video_required: mainSong?.replacement_video_required ?? false,
    replacement_video_url: mainSong?.replacement_video_url ?? "",
    nf_name: nf?.nf_name ?? "",
    expected_entry_count:
      nf?.expected_entry_count !== null && nf?.expected_entry_count !== undefined
        ? String(nf.expected_entry_count)
        : "",
    nf_entries: editableNfEntries.map(
      (entry: { artist?: string | null; song_title?: string | null; song_url?: string | null }) => ({
        artist: entry.artist ?? "",
        song_title: entry.song_title ?? "",
        song_url: entry.song_url ?? "",
      }),
    ),
    nf_date_type: (s.nf_date_type ?? "") as DateType | "",
    nf_exact_date: s.nf_exact_date ?? "",
    nf_approximate_text: s.nf_approximate_text ?? "",
    nf_result_date_type: (s.nf_result_date_type ?? "") as DateType | "",
    nf_result_exact_date: s.nf_result_exact_date ?? "",
    nf_result_approximate_text: s.nf_result_approximate_text ?? "",
    reveal_date_type: (s.reveal_date_type ?? "") as DateType | "",
    reveal_exact_date: s.reveal_exact_date ?? "",
    reveal_approximate_text: s.reveal_approximate_text ?? "",
  };
}
