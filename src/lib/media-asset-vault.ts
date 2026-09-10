export const MEDIA_ASSET_TYPES = [
  'logo',
  'flag',
  'artist_photo',
  'cover_artwork',
  'audio_master',
  'performance_video',
  'postcard',
  'press_image',
  'broadcast_graphic',
] as const;

export type MediaAssetType = (typeof MEDIA_ASSET_TYPES)[number];
export type MediaAssetVisibility = 'private' | 'delegation' | 'press' | 'public';

export type MediaAssetOwner = {
  editionId?: string | null;
  countryId?: string | null;
  entryId?: string | null;
  artistId?: string | null;
};

export type MediaAssetVersion = {
  id: string;
  assetId: string;
  version: number;
  storagePath: string;
  mimeType: string;
  bytes: number;
  uploadedBy: string;
  uploadedAt: string;
};

export type MediaAsset = {
  id: string;
  type: MediaAssetType;
  title: string;
  visibility: MediaAssetVisibility;
  owner: MediaAssetOwner;
  currentVersionId: string | null;
  locked: boolean;
};

export function validateMediaAsset(asset: MediaAsset): void {
  if (!asset.id.trim()) throw new Error('Media asset id is required');
  if (!asset.title.trim()) throw new Error('Media asset title is required');

  const ownerCount = [
    asset.owner.editionId,
    asset.owner.countryId,
    asset.owner.entryId,
    asset.owner.artistId,
  ].filter(Boolean).length;
  if (ownerCount === 0) throw new Error('Media asset must belong to at least one contest entity');
}

export function validateMediaAssetVersion(version: MediaAssetVersion): void {
  if (!version.storagePath.trim()) throw new Error('Media asset storage path is required');
  if (!version.mimeType.trim()) throw new Error('Media asset MIME type is required');
  if (!Number.isInteger(version.version) || version.version <= 0) {
    throw new Error('Media asset version must be a positive integer');
  }
  if (!Number.isInteger(version.bytes) || version.bytes < 0) {
    throw new Error('Media asset byte size must be a non-negative integer');
  }
}

export function nextMediaAssetVersion(input: {
  assetId: string;
  versions: readonly MediaAssetVersion[];
  storagePath: string;
  mimeType: string;
  bytes: number;
  uploadedBy: string;
  uploadedAt?: string;
  id?: string;
}): MediaAssetVersion {
  const latest = input.versions
    .filter((version) => version.assetId === input.assetId)
    .reduce((max, version) => Math.max(max, version.version), 0);

  const version: MediaAssetVersion = {
    id: input.id ?? `${input.assetId}:v${latest + 1}`,
    assetId: input.assetId,
    version: latest + 1,
    storagePath: input.storagePath,
    mimeType: input.mimeType,
    bytes: input.bytes,
    uploadedBy: input.uploadedBy,
    uploadedAt: input.uploadedAt ?? new Date().toISOString(),
  };
  validateMediaAssetVersion(version);
  return version;
}

export function canReplaceMediaAsset(asset: MediaAsset, hasOverridePermission = false): boolean {
  return !asset.locked || hasOverridePermission;
}
