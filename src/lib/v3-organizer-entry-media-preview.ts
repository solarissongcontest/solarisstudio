import { safeOrganizerEntrySourceUrl } from "./v3-organizer-entry-source-inspection";

export type OrganizerEntryPreviewRole = "song" | "replacement_video";
export type OrganizerEntryPreviewKind = "audio" | "video";
export type OrganizerEntryPreviewSource = {
  url: string;
  host: string;
  kind: OrganizerEntryPreviewKind;
};

const audioExt = new Set(["mp3", "m4a", "wav", "ogg", "flac", "aac"]);
const videoExt = new Set(["mp4", "webm", "mov", "m4v"]);

/**
 * A display-only opt-in player source, not media eligibility or access
 * authorization. Unknown web pages and private opaque links stay external.
 * Source URLs may include signed query strings; only the path extension
 * determines whether a browser-native inline preview is offered.
 */
export function resolveOrganizerEntryMediaPreview(
  value: string | null | undefined,
  role: OrganizerEntryPreviewRole,
): OrganizerEntryPreviewSource | null {
  const safe = safeOrganizerEntrySourceUrl(value);
  if (!safe) return null;

  const url = new URL(safe);
  const ext = /\.([a-z0-9]+)$/i.exec(url.pathname)?.[1]?.toLowerCase() ?? "";
  const kind: OrganizerEntryPreviewKind | null =
    role === "song"
      ? audioExt.has(ext) ? "audio" : videoExt.has(ext) ? "video" : null
      : videoExt.has(ext) ? "video" : null;

  return kind ? { url: safe, host: url.host, kind } : null;
}
