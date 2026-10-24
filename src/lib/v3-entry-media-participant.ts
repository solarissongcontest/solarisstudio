import type {
  V3EntryMediaAssetType,
  V3EntryMediaAuthorityAsset,
  V3EntryMediaAuthorityProjection,
  V3EntryMediaAuthorityState,
} from "./v3-entry-media-authority";

export const V3_ENTRY_MEDIA_PARTICIPANT_SLOTS = [
  {
    assetType: "artist_photo",
    label: "Artist photo",
    description: "The current artist image attached to this Entry.",
  },
  {
    assetType: "cover_artwork",
    label: "Cover artwork",
    description: "The current cover artwork attached to this Entry.",
  },
] as const satisfies readonly {
  assetType: V3EntryMediaAssetType;
  label: string;
  description: string;
}[];

/**
 * Client-side preflight only. The System authority repeats MIME, byte-size,
 * caller-scope and source-version validation before it authorizes anything.
 */
export const V3_ENTRY_MEDIA_ACCEPTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const V3_ENTRY_MEDIA_MAX_BYTES = 5 * 1024 * 1024;

export type V3EntryMediaSelection = {
  type: string;
  size: number;
};

export function validateV3EntryMediaSelection(file: V3EntryMediaSelection): string | null {
  if (!V3_ENTRY_MEDIA_ACCEPTED_MIME_TYPES.includes(file.type as (typeof V3_ENTRY_MEDIA_ACCEPTED_MIME_TYPES)[number])) {
    return "Choose a JPEG, PNG or WebP image.";
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return "Choose a non-empty image file.";
  }
  if (file.size > V3_ENTRY_MEDIA_MAX_BYTES) {
    return "The image must be 5 MB or smaller.";
  }
  return null;
}

export function participantEntryMediaAsset(
  projection: V3EntryMediaAuthorityProjection | null | undefined,
  assetType: V3EntryMediaAssetType,
): V3EntryMediaAuthorityAsset | null {
  return projection?.assets.find((asset) => asset.assetType === assetType) ?? null;
}

export type V3EntryMediaParticipantPresentation = {
  state: "missing" | V3EntryMediaAuthorityState;
  label: string;
  detail: string;
  attention: "neutral" | "working" | "success" | "danger";
};

export function presentV3EntryMediaAsset(
  asset: V3EntryMediaAuthorityAsset | null | undefined,
): V3EntryMediaParticipantPresentation {
  if (!asset) {
    return {
      state: "missing",
      label: "Not uploaded",
      detail: "No current source is attached to this slot.",
      attention: "neutral",
    };
  }

  const reason = asset.reason?.trim();
  switch (asset.state) {
    case "processing":
      return {
        state: asset.state,
        label: "Processing",
        detail: reason || "Upload received. Solaris is processing the verified image.",
        attention: "working",
      };
    case "validating":
      return {
        state: asset.state,
        label: "Validating",
        detail: reason || "The verified source is waiting for authoritative validation and review evidence.",
        attention: "working",
      };
    case "accepted":
      return {
        state: asset.state,
        label: "Accepted",
        detail: reason || "The current source is accepted.",
        attention: "success",
      };
    case "failed":
      return {
        state: asset.state,
        label: "Processing failed",
        detail: reason || "Solaris could not process the current source. You can choose another image.",
        attention: "danger",
      };
    case "quarantined":
      return {
        state: asset.state,
        label: "Quarantined",
        detail: reason || "This source cannot be used while it remains quarantined.",
        attention: "danger",
      };
    case "replacement_required":
      return {
        state: asset.state,
        label: "Replacement required",
        detail: reason || "Organizer review requires a replacement for this media.",
        attention: "danger",
      };
  }
}
