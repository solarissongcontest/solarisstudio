import { supabase } from '@/integrations/supabase/client';
import type { Country, Edition } from './data';
import type { Studio2CountryCockpitRow } from './studio2-country-cockpit';
import type { MediaAssetType } from './media-asset-vault';

export const STUDIO2_MEDIA_ASSET_STATES = [
  'required',
  'missing',
  'uploaded',
  'processing',
  'valid',
  'invalid',
  'superseded',
  'approved',
] as const;

export type Studio2MediaAssetState = (typeof STUDIO2_MEDIA_ASSET_STATES)[number];
export type Studio2MediaReviewDecision = 'approved' | 'invalid';
export type Studio2MediaValidationLevel = 'pass' | 'warning' | 'blocked';

export type Studio2MediaValidationCheck = {
  id: string;
  label: string;
  level: Studio2MediaValidationLevel;
  message: string;
};

export type Studio2MediaAssetReview = {
  id: string;
  editionId: string;
  assetKey: string;
  assetType: MediaAssetType;
  countryId: string | null;
  entryId: string | null;
  sourceFingerprint: string;
  decision: Studio2MediaReviewDecision;
  reason: string;
  reviewedBy: string;
  reviewedByName: string | null;
  reviewedAt: string;
  supersededAt: string | null;
};

export type Studio2MediaAssetItem = {
  assetKey: string;
  assetType: MediaAssetType;
  title: string;
  editionId: string;
  countryId: string | null;
  countryName: string | null;
  entryId: string | null;
  entryLabel: string | null;
  sourceUrl: string | null;
  sourceFingerprint: string | null;
  sourceUpdatedAt: string | null;
  required: boolean;
  processing: boolean;
  state: Studio2MediaAssetState;
  validation: Studio2MediaValidationCheck[];
  activeReview: Studio2MediaAssetReview | null;
  previousReview: Studio2MediaAssetReview | null;
};

export type Studio2MediaInventoryInput = {
  edition: Pick<Edition, 'id' | 'name' | 'logo'>;
  countries: readonly Country[];
  cockpits: readonly Studio2CountryCockpitRow[];
  reviews?: readonly Studio2MediaAssetReview[];
};

export type Studio2MediaReviewRequest = {
  assetKey: string;
  assetType: MediaAssetType;
  countryId: string | null;
  entryId: string | null;
  sourceFingerprint: string;
  decision: Studio2MediaReviewDecision;
};

type RpcClient = {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

const rpcClient = supabase as unknown as RpcClient;

const ENTRY_METADATA_ALIASES: Partial<Record<MediaAssetType, readonly string[]>> = {
  artist_photo: ['artist_photo_url', 'artistPhotoUrl', 'artist_image_url', 'artistImageUrl'],
  cover_artwork: ['cover_artwork_url', 'coverArtworkUrl', 'artwork_url', 'artworkUrl'],
  audio_master: ['audio_master_url', 'audioMasterUrl', 'audio_url', 'audioUrl'],
  postcard: ['postcard_url', 'postcardUrl'],
  press_image: ['press_image_url', 'pressImageUrl'],
  broadcast_graphic: ['broadcast_graphic_url', 'broadcastGraphicUrl'],
};

const PROCESSING_ALIASES: Partial<Record<MediaAssetType, readonly string[]>> = {
  artist_photo: ['artist_photo_processing', 'artistPhotoProcessing'],
  cover_artwork: ['cover_artwork_processing', 'coverArtworkProcessing'],
  audio_master: ['audio_master_processing', 'audioMasterProcessing'],
  performance_video: ['video_processing', 'videoProcessing'],
  postcard: ['postcard_processing', 'postcardProcessing'],
  press_image: ['press_image_processing', 'pressImageProcessing'],
  broadcast_graphic: ['broadcast_graphic_processing', 'broadcastGraphicProcessing'],
};

function readMetadataString(metadata: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function readMetadataBoolean(metadata: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.some((key) => metadata[key] === true || metadata[key] === 'true');
}

function sourceFingerprint(sourceUrl: string | null | undefined): string | null {
  const normalized = sourceUrl?.trim() ?? '';
  return normalized || null;
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function extensionFromUrl(value: string): string | null {
  try {
    const pathname = new URL(value).pathname.toLowerCase();
    const match = pathname.match(/\.([a-z0-9]{2,8})$/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function expectedExtensions(type: MediaAssetType): readonly string[] | null {
  if (['logo', 'flag', 'artist_photo', 'cover_artwork', 'postcard', 'press_image', 'broadcast_graphic'].includes(type)) {
    return ['png', 'jpg', 'jpeg', 'webp', 'svg', 'avif'];
  }
  if (type === 'audio_master') return ['wav', 'flac', 'mp3', 'm4a', 'aac'];
  if (type === 'performance_video') return ['mp4', 'mov', 'webm', 'm4v'];
  return null;
}

export function validateStudio2MediaAssetSource(
  type: MediaAssetType,
  sourceUrl: string | null,
): Studio2MediaValidationCheck[] {
  if (!sourceUrl?.trim()) {
    return [{
      id: 'source-present',
      label: 'Source supplied',
      level: 'blocked',
      message: 'No canonical source is currently supplied for this asset slot.',
    }];
  }

  const checks: Studio2MediaValidationCheck[] = [];
  const validUrl = isHttpUrl(sourceUrl);
  checks.push({
    id: 'source-url',
    label: 'Source URL',
    level: validUrl ? 'pass' : 'blocked',
    message: validUrl ? 'Canonical source uses an HTTP(S) URL.' : 'Canonical source is not a valid HTTP(S) URL.',
  });

  if (!validUrl) return checks;

  const extension = extensionFromUrl(sourceUrl);
  const expected = expectedExtensions(type);
  if (extension && expected) {
    checks.push({
      id: 'file-extension',
      label: 'File type hint',
      level: expected.includes(extension) ? 'pass' : 'warning',
      message: expected.includes(extension)
        ? `The .${extension} extension is compatible with ${type.replace(/_/g, ' ')}.`
        : `The .${extension} extension is unusual for ${type.replace(/_/g, ' ')}; inspect the source before approval.`,
    });
  } else if (expected) {
    checks.push({
      id: 'file-extension',
      label: 'File type hint',
      level: 'warning',
      message: 'The URL does not expose a file extension. Content type must be confirmed outside this URL-only validation layer.',
    });
  }

  return checks;
}

function latestReviewFor(
  reviews: readonly Studio2MediaAssetReview[],
  assetKey: string,
): Studio2MediaAssetReview | null {
  return reviews
    .filter((review) => review.assetKey === assetKey)
    .slice()
    .sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt))[0] ?? null;
}

function currentReviewFor(
  reviews: readonly Studio2MediaAssetReview[],
  assetKey: string,
  fingerprint: string | null,
): Studio2MediaAssetReview | null {
  if (!fingerprint) return null;
  return reviews
    .filter((review) => review.assetKey === assetKey && review.sourceFingerprint === fingerprint && !review.supersededAt)
    .slice()
    .sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt))[0] ?? null;
}

export function resolveStudio2MediaAssetState(input: {
  required: boolean;
  sourceUrl: string | null;
  processing?: boolean;
  validation: readonly Studio2MediaValidationCheck[];
  activeReview?: Studio2MediaAssetReview | null;
  previousReview?: Studio2MediaAssetReview | null;
}): Studio2MediaAssetState {
  if (!input.sourceUrl?.trim()) return input.required ? 'required' : 'missing';
  if (input.processing) return 'processing';
  if (input.activeReview?.decision === 'invalid') return 'invalid';
  if (input.activeReview?.decision === 'approved') return 'approved';
  if (input.previousReview && input.previousReview.sourceFingerprint !== sourceFingerprint(input.sourceUrl)) {
    return 'superseded';
  }
  if (input.validation.some((check) => check.level === 'blocked')) return 'invalid';
  if (input.validation.length) return 'valid';
  return 'uploaded';
}

function buildItem(input: {
  assetKey: string;
  assetType: MediaAssetType;
  title: string;
  editionId: string;
  countryId?: string | null;
  countryName?: string | null;
  entryId?: string | null;
  entryLabel?: string | null;
  sourceUrl?: string | null;
  sourceUpdatedAt?: string | null;
  required?: boolean;
  processing?: boolean;
  reviews: readonly Studio2MediaAssetReview[];
}): Studio2MediaAssetItem {
  const sourceUrl = input.sourceUrl?.trim() || null;
  const fingerprint = sourceFingerprint(sourceUrl);
  const validation = validateStudio2MediaAssetSource(input.assetType, sourceUrl);
  const activeReview = currentReviewFor(input.reviews, input.assetKey, fingerprint);
  const latestReview = latestReviewFor(input.reviews, input.assetKey);
  const previousReview = latestReview && latestReview.id !== activeReview?.id ? latestReview : null;
  const required = input.required ?? false;
  const processing = Boolean(input.processing);

  return {
    assetKey: input.assetKey,
    assetType: input.assetType,
    title: input.title,
    editionId: input.editionId,
    countryId: input.countryId ?? null,
    countryName: input.countryName ?? null,
    entryId: input.entryId ?? null,
    entryLabel: input.entryLabel ?? null,
    sourceUrl,
    sourceFingerprint: fingerprint,
    sourceUpdatedAt: input.sourceUpdatedAt ?? null,
    required,
    processing,
    validation,
    activeReview,
    previousReview,
    state: resolveStudio2MediaAssetState({
      required,
      sourceUrl,
      processing,
      validation,
      activeReview,
      previousReview,
    }),
  };
}

export function buildStudio2MediaAssetInventory(input: Studio2MediaInventoryInput): Studio2MediaAssetItem[] {
  const reviews = input.reviews ?? [];
  const countryById = new Map(input.countries.map((country) => [country.id, country]));
  const items: Studio2MediaAssetItem[] = [];

  items.push(buildItem({
    assetKey: `edition:${input.edition.id}:logo`,
    assetType: 'logo',
    title: `${input.edition.name} edition logo`,
    editionId: input.edition.id,
    sourceUrl: input.edition.logo,
    required: false,
    reviews,
  }));

  for (const cockpit of input.cockpits) {
    const { context } = cockpit;
    const country = countryById.get(context.countryId);
    const entry = context.entry;
    const metadata = entry?.metadata ?? {};
    const entryLabel = entry
      ? [entry.artist, entry.songTitle].filter(Boolean).join(' · ') || context.countryName
      : context.countryName;

    items.push(buildItem({
      assetKey: `country:${context.countryId}:flag`,
      assetType: 'flag',
      title: `${context.countryName} flag`,
      editionId: context.editionId,
      countryId: context.countryId,
      countryName: context.countryName,
      sourceUrl: country?.flag_image ?? null,
      required: true,
      reviews,
    }));

    items.push(buildItem({
      assetKey: entry ? `entry:${entry.id}:performance_video` : `country:${context.countryId}:performance_video`,
      assetType: 'performance_video',
      title: `${context.countryName} performance video`,
      editionId: context.editionId,
      countryId: context.countryId,
      countryName: context.countryName,
      entryId: entry?.id ?? null,
      entryLabel,
      sourceUrl: entry?.songUrl ?? null,
      sourceUpdatedAt: entry?.updatedAt ?? null,
      required: true,
      processing: entry ? readMetadataBoolean(metadata, PROCESSING_ALIASES.performance_video ?? []) : false,
      reviews,
    }));

    if (!entry) continue;

    for (const [assetType, aliases] of Object.entries(ENTRY_METADATA_ALIASES) as Array<[MediaAssetType, readonly string[]]>) {
      const value = readMetadataString(metadata, aliases);
      if (!value) continue;
      items.push(buildItem({
        assetKey: `entry:${entry.id}:${assetType}`,
        assetType,
        title: `${context.countryName} ${assetType.replace(/_/g, ' ')}`,
        editionId: context.editionId,
        countryId: context.countryId,
        countryName: context.countryName,
        entryId: entry.id,
        entryLabel,
        sourceUrl: value,
        sourceUpdatedAt: entry.updatedAt,
        required: false,
        processing: readMetadataBoolean(metadata, PROCESSING_ALIASES[assetType] ?? []),
        reviews,
      }));
    }
  }

  return items.sort((a, b) => {
    const countryCompare = (a.countryName ?? '').localeCompare(b.countryName ?? '');
    if (countryCompare) return countryCompare;
    return a.assetType.localeCompare(b.assetType);
  });
}

function expectObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${label}`);
  return value as Record<string, unknown>;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function mapReview(value: unknown): Studio2MediaAssetReview {
  const row = expectObject(value, 'media asset review');
  const decision = row.decision;
  if (decision !== 'approved' && decision !== 'invalid') throw new Error('Invalid media review decision');
  return {
    id: String(row.id),
    editionId: String(row.editionId),
    assetKey: String(row.assetKey),
    assetType: String(row.assetType) as MediaAssetType,
    countryId: nullableString(row.countryId),
    entryId: nullableString(row.entryId),
    sourceFingerprint: String(row.sourceFingerprint),
    decision,
    reason: String(row.reason ?? ''),
    reviewedBy: String(row.reviewedBy),
    reviewedByName: nullableString(row.reviewedByName),
    reviewedAt: String(row.reviewedAt),
    supersededAt: nullableString(row.supersededAt),
  };
}

async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await rpcClient.rpc(name, args);
  if (error) throw error;
  return data;
}

export async function listStudio2MediaAssetReviews(editionId: string): Promise<Studio2MediaAssetReview[]> {
  if (!editionId) return [];
  const data = await rpc('studio2_media_asset_reviews', { p_edition_id: editionId });
  if (!Array.isArray(data)) return [];
  return data.map(mapReview);
}

export async function reviewStudio2MediaAssets(input: {
  editionId: string;
  reviews: readonly Studio2MediaReviewRequest[];
  reason: string;
}): Promise<Studio2MediaAssetReview[]> {
  const reason = input.reason.trim();
  if (!input.editionId) throw new Error('Edition is required.');
  if (!input.reviews.length) throw new Error('Select at least one media asset.');
  if (reason.length < 5) throw new Error('A review reason of at least 5 characters is required.');
  if (input.reviews.some((review) => !review.sourceFingerprint.trim())) {
    throw new Error('Only uploaded media can be reviewed.');
  }

  const data = await rpc('studio2_review_media_assets', {
    p_edition_id: input.editionId,
    p_reviews: input.reviews,
    p_reason: reason,
  });
  if (!Array.isArray(data)) return [];
  return data.map(mapReview);
}

export function summarizeStudio2MediaAssets(items: readonly Studio2MediaAssetItem[]) {
  const counts = Object.fromEntries(
    STUDIO2_MEDIA_ASSET_STATES.map((state) => [state, items.filter((item) => item.state === state).length]),
  ) as Record<Studio2MediaAssetState, number>;
  return {
    total: items.length,
    reviewable: items.filter((item) => Boolean(item.sourceFingerprint)).length,
    blocking: items.filter((item) => item.required && ['required', 'invalid'].includes(item.state)).length,
    counts,
  };
}
