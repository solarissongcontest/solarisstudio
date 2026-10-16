import { ExternalLink, FileQuestion } from "lucide-react";

import type { MediaAssetType } from "@/lib/media-asset-vault";

const IMAGE_ASSET_TYPES = new Set<MediaAssetType>([
  "logo",
  "flag",
  "artist_photo",
  "cover_artwork",
  "postcard",
  "press_image",
  "broadcast_graphic",
]);

const DIRECT_AUDIO_EXTENSIONS = new Set(["mp3", "m4a", "aac", "wav", "flac", "ogg"]);
const DIRECT_VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "m4v", "ogv"]);

export type MediaAssetPreviewKind = "image" | "audio" | "video" | "fallback";

function safeHttpUrl(value: string | null | undefined): URL | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

function extension(url: URL): string | null {
  const match = url.pathname.toLowerCase().match(/\.([a-z0-9]{2,8})$/);
  return match?.[1] ?? null;
}

export function mediaAssetPreviewKind(
  assetType: MediaAssetType,
  sourceUrl: string | null | undefined,
): MediaAssetPreviewKind {
  const url = safeHttpUrl(sourceUrl);
  if (!url) return "fallback";
  if (IMAGE_ASSET_TYPES.has(assetType)) return "image";

  const ext = extension(url);
  if (assetType === "audio_master" && ext && DIRECT_AUDIO_EXTENSIONS.has(ext)) return "audio";
  if (assetType === "performance_video" && ext && DIRECT_VIDEO_EXTENSIONS.has(ext)) return "video";
  return "fallback";
}

export function MediaAssetPreview({
  assetType,
  sourceUrl,
  title,
}: {
  assetType: MediaAssetType;
  sourceUrl: string | null | undefined;
  title: string;
}) {
  const kind = mediaAssetPreviewKind(assetType, sourceUrl);
  const url = safeHttpUrl(sourceUrl)?.toString() ?? null;

  if (!url) {
    return (
      <div className="grid min-h-28 place-items-center rounded-xl border border-dashed border-white/[0.09] bg-black/10 p-4 text-center">
        <div>
          <FileQuestion className="mx-auto size-5 text-muted-foreground" />
          <p className="mt-2 text-xs text-muted-foreground">No previewable canonical source is available.</p>
        </div>
      </div>
    );
  }

  if (kind === "image") {
    return (
      <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-black/20">
        <img
          src={url}
          alt={`${title} preview`}
          loading="lazy"
          decoding="async"
          className="max-h-[28rem] w-full object-contain"
        />
      </div>
    );
  }

  if (kind === "audio") {
    return (
      <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3">
        <audio controls preload="metadata" className="w-full" aria-label={`${title} audio preview`}>
          <source src={url} />
        </audio>
      </div>
    );
  }

  if (kind === "video") {
    return (
      <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-black/20">
        <video
          controls
          preload="metadata"
          playsInline
          className="max-h-[28rem] w-full bg-black object-contain"
          aria-label={`${title} video preview`}
        >
          <source src={url} />
        </video>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/10 p-4">
      <p className="text-xs leading-5 text-muted-foreground">
        This source cannot be embedded reliably from its URL. Inspect the canonical source directly instead.
      </p>
      <a href={url} target="_blank" rel="noreferrer" className="admin-action-secondary mt-3 inline-flex">
        Open source <ExternalLink className="size-4" />
      </a>
    </div>
  );
}
