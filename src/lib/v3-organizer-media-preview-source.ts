import type { MediaAssetType } from "./media-asset-vault";

export type OrganizerMediaPreviewKind = "image" | "audio" | "video";
export type OrganizerMediaPreviewSource = {
  url: string;
  host: string;
  previewKind: OrganizerMediaPreviewKind | null;
};

const imageTypes = new Set<MediaAssetType>([
  "logo", "flag", "artist_photo", "cover_artwork",
  "postcard", "press_image", "broadcast_graphic",
]);
const imageExtensions = new Set(["png", "jpg", "jpeg", "webp", "gif", "avif"]);
const audioExtensions = new Set(["mp3", "m4a", "wav", "ogg", "flac"]);
const videoExtensions = new Set(["mp4", "webm", "mov"]);

/**
 * A source is an untrusted URL even when its identity is in an authorized
 * Organizer projection. Never render javascript:, data:, blob: or relative
 * links. Inline media loads require an explicit operator action and a
 * recognized direct-file extension; external media pages remain links only.
 *
 * This does not authorize access to a private object. The existing Organizer
 * read contract and the source server's authorization remain authoritative.
 */
export function resolveOrganizerMediaPreviewSource(
  sourceUrl: string | null | undefined,
  assetType: MediaAssetType,
): OrganizerMediaPreviewSource | null {
  if (sourceUrl && /[\u0000-\u001f\u007f]/.test(sourceUrl)) return null;
  const trimmed = sourceUrl?.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.username || parsed.password
    ) return null;

    const extension = /\.([a-z0-9]+)$/i.exec(parsed.pathname)?.[1]?.toLowerCase() ?? "";
    let previewKind: OrganizerMediaPreviewKind | null = null;
    if (imageTypes.has(assetType) && imageExtensions.has(extension)) {
      previewKind = "image";
    } else if (assetType === "audio_master" && audioExtensions.has(extension)) {
      previewKind = "audio";
    } else if (assetType === "performance_video" && videoExtensions.has(extension)) {
      previewKind = "video";
    }
    return { url: parsed.href, host: parsed.host, previewKind };
  } catch {
    return null;
  }
}

/**
 * Source fingerprints in the current media inventory can contain a complete
 * signed URL. The Organizer's visible label must NEVER repeat the path,
 * query string, fragments or embedded access tokens. The full identity stays
 * available only to the canonical review operation and guarded preview link.
 */
export function describeOrganizerMediaSource(
  sourceUrl: string | null | undefined,
): string {
  if (!sourceUrl?.trim()) return "No source supplied";
  if (/[\u0000-\u001f\u007f]/.test(sourceUrl)) return "Source link requires inspection";
  try {
    const source = new URL(sourceUrl.trim());
    if ((source.protocol !== "http:" && source.protocol !== "https:") ||
        !source.hostname || source.username || source.password) {
      return "Source link requires inspection";
    }
    return `External source · ${source.host}`;
  } catch {
    return "Source link requires inspection";
  }
}
