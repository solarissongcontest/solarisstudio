/**
 * Untrusted participant-supplied source links must not be emitted directly into
 * an Organizer href. This resolver never fetches or authorizes the resource.
 */
export function safeOrganizerEntrySourceUrl(source: string | null | undefined): string | null {
  const value = source?.trim();
  if (!value || /[\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      !url.hostname || url.username || url.password
    ) return null;
    return url.href;
  } catch {
    return null;
  }
}

export type OrganizerEntrySourceInput = {
  artist?: string | null;
  song_title?: string | null;
  song_url?: string | null;
  replacement_video_required?: boolean | null;
  replacement_video_url?: string | null;
  current_version_id?: string | null;
  reviewed_version_id?: string | null;
  review_status?: string | null;
};
export type OrganizerEntrySourceCheck = {
  id: "artist" | "title" | "song-link" | "replacement-video" | "review-version";
  label: string;
  status: "present" | "attention" | "manual";
  detail: string;
};
export type OrganizerEntrySourceInspection = {
  songUrl: string | null;
  replacementVideoUrl: string | null;
  checks: OrganizerEntrySourceCheck[];
};

/**
 * Display-only metadata guidance. It does NOT replace server review checks,
 * decide eligibility, infer rules, or authorize approval. Missing URLs might
 * be perfectly allowed for some editions or submission states.
 */
export function inspectOrganizerEntrySource(
  entry: OrganizerEntrySourceInput,
): OrganizerEntrySourceInspection {
  const songUrl = safeOrganizerEntrySourceUrl(entry.song_url);
  const replacementVideoUrl = safeOrganizerEntrySourceUrl(entry.replacement_video_url);
  const artist = entry.artist?.trim() ?? "";
  const title = entry.song_title?.trim() ?? "";
  const checks: OrganizerEntrySourceCheck[] = [
    {
      id: "artist",
      label: "Artist name",
      status: artist ? "present" : "attention",
      detail: artist ? "Submitted artist name is present." : "No artist name in the current response.",
    },
    {
      id: "title",
      label: "Song title",
      status: title ? "present" : "attention",
      detail: title ? "Submitted song title is present." : "No song title in the current response.",
    },
    {
      id: "song-link",
      label: "Song source link",
      status: songUrl ? "present" : entry.song_url?.trim() ? "attention" : "manual",
      detail: songUrl
        ? "A usable HTTP(S) link was supplied; contents still require review."
        : entry.song_url?.trim()
          ? "The submitted URL cannot be safely opened. Request a valid link if needed."
          : "No source link supplied. Confirm whether this submission requires one.",
    },
  ];

  if (entry.replacement_video_required) {
    checks.push({
      id: "replacement-video",
      label: "Required replacement video",
      status: replacementVideoUrl ? "present" : "attention",
      detail: replacementVideoUrl
        ? "A replacement link is present; inspect the actual media before approval."
        : entry.replacement_video_url?.trim()
          ? "The replacement URL cannot be safely opened."
          : "Replacement is marked required but no video URL was supplied.",
    });
  }

  if (entry.current_version_id?.trim() &&
      (entry.review_status === "accepted" || entry.review_status === "declined")) {
    const matches = entry.current_version_id.trim() === entry.reviewed_version_id?.trim();
    checks.push({
      id: "review-version",
      label: "Current-version review",
      status: matches ? "present" : "attention",
      detail: matches
        ? "The recorded review is bound to this exact Entry version."
        : "Previous review evidence is not bound to the current Entry version.",
    });
  }

  return { songUrl, replacementVideoUrl, checks };
}

/**
 * Presentation-only effective review status. Older accepted/declined decisions
 * are evidence of a previous immutable Entry version, never current approval.
 * The canonical review command is still the sole mutation authority.
 */
export function effectiveOrganizerEntryReviewStatus(
  entry: OrganizerEntrySourceInput & { removed?: boolean | null },
): "pending" | "accepted" | "declined" | "removed" {
  if (entry.removed || entry.review_status === "removed") return "removed";
  if (entry.review_status !== "accepted" && entry.review_status !== "declined") return "pending";
  const current = entry.current_version_id?.trim();
  const reviewed = entry.reviewed_version_id?.trim();
  return current && reviewed && current === reviewed ? entry.review_status : "pending";
}
