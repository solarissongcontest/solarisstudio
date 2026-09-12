import { describe, expect, it } from 'vitest';
import type { Country, Edition } from './data';
import type { Studio2CountryCockpitRow } from './studio2-country-cockpit';
import {
  buildStudio2MediaAssetInventory,
  resolveStudio2MediaAssetState,
  summarizeStudio2MediaAssets,
  validateStudio2MediaAssetSource,
  type Studio2MediaAssetReview,
} from './studio2-media-assets';

const edition: Edition = {
  id: 'edition-1',
  edition_number: 21,
  name: 'SSC 21',
  year: 2026,
  slug: 'ssc21',
  description: null,
  host_country_id: null,
  host_city: null,
  logo: 'https://cdn.example.test/ssc21.svg',
  theme_id: null,
  status: 'active',
  published: false,
};

const country: Country = {
  id: 'country-1',
  name: 'Oland',
  native_name: null,
  short_code: 'OLA',
  flag_image: 'https://cdn.example.test/oland.png',
  region: 'North',
  accent_color: '#ffffff',
  description: null,
  first_participation: 1,
};

function cockpit(input: {
  songUrl?: string | null;
  metadata?: Record<string, unknown>;
  updatedAt?: string;
  entry?: boolean;
} = {}): Studio2CountryCockpitRow {
  const hasEntry = input.entry ?? true;
  return {
    context: {
      editionId: edition.id,
      editionName: edition.name,
      countryId: country.id,
      countryName: country.name,
      entry: hasEntry ? {
        id: 'entry-1',
        artist: 'Nera Vale',
        songTitle: 'Divine Gate',
        songUrl: input.songUrl === undefined ? 'https://video.example.test/performance.mp4' : input.songUrl,
        status: 'confirmed',
        source: 'confirmations',
        metadata: input.metadata ?? {},
        createdAt: '2026-09-10T10:00:00.000Z',
        updatedAt: input.updatedAt ?? '2026-09-12T10:00:00.000Z',
      } : null,
    },
  } as unknown as Studio2CountryCockpitRow;
}

function review(sourceFingerprint: string, decision: 'approved' | 'invalid' = 'approved'): Studio2MediaAssetReview {
  return {
    id: `review-${decision}-${sourceFingerprint}`,
    editionId: edition.id,
    assetKey: 'entry:entry-1:performance_video',
    assetType: 'performance_video',
    countryId: country.id,
    entryId: 'entry-1',
    sourceFingerprint,
    decision,
    reason: 'Organizer media review',
    reviewedBy: 'organizer-1',
    reviewedByName: null,
    reviewedAt: '2026-09-12T11:00:00.000Z',
    supersededAt: null,
  };
}

describe('Studio 2 media asset operations', () => {
  it('validates canonical media sources in the domain service', () => {
    const valid = validateStudio2MediaAssetSource('performance_video', 'https://cdn.example.test/performance.mp4');
    expect(valid.some((check) => check.level === 'blocked')).toBe(false);
    expect(valid.find((check) => check.id === 'file-extension')?.level).toBe('pass');

    const invalid = validateStudio2MediaAssetSource('performance_video', 'javascript:alert(1)');
    expect(invalid.some((check) => check.level === 'blocked')).toBe(true);
  });

  it('builds required canonical slots and optional metadata-backed asset classes', () => {
    const items = buildStudio2MediaAssetInventory({
      edition,
      countries: [country],
      cockpits: [cockpit({
        metadata: {
          artist_photo_url: 'https://cdn.example.test/artist.webp',
          audio_master_url: 'https://cdn.example.test/master.wav',
        },
      })],
    });

    expect(items.find((item) => item.assetType === 'flag')?.state).toBe('valid');
    expect(items.find((item) => item.assetType === 'performance_video')?.required).toBe(true);
    expect(items.find((item) => item.assetType === 'artist_photo')?.state).toBe('valid');
    expect(items.find((item) => item.assetType === 'audio_master')?.state).toBe('valid');
  });

  it('distinguishes a missing required media slot from optional missing media', () => {
    const items = buildStudio2MediaAssetInventory({
      edition: { ...edition, logo: null },
      countries: [{ ...country, flag_image: null }],
      cockpits: [cockpit({ songUrl: null })],
    });

    expect(items.find((item) => item.assetType === 'flag')?.state).toBe('required');
    expect(items.find((item) => item.assetType === 'performance_video')?.state).toBe('required');
    expect(items.find((item) => item.assetType === 'logo')?.state).toBe('missing');
    expect(summarizeStudio2MediaAssets(items).blocking).toBe(2);
  });

  it('projects organizer decisions without rewriting the canonical source', () => {
    const source = 'https://video.example.test/performance.mp4';
    const items = buildStudio2MediaAssetInventory({
      edition,
      countries: [country],
      cockpits: [cockpit({ songUrl: source })],
      reviews: [review(source, 'approved')],
    });

    const video = items.find((item) => item.assetType === 'performance_video');
    expect(video?.state).toBe('approved');
    expect(video?.sourceUrl).toBe(source);
    expect(video?.activeReview?.decision).toBe('approved');
  });

  it('marks a changed canonical source as superseded until the new version is reviewed', () => {
    const oldSource = 'https://video.example.test/old.mp4';
    const newSource = 'https://video.example.test/new.mp4';
    const items = buildStudio2MediaAssetInventory({
      edition,
      countries: [country],
      cockpits: [cockpit({ songUrl: newSource })],
      reviews: [review(oldSource, 'approved')],
    });

    const video = items.find((item) => item.assetType === 'performance_video');
    expect(video?.state).toBe('superseded');
    expect(video?.previousReview?.sourceFingerprint).toBe(oldSource);
    expect(video?.sourceFingerprint).toBe(newSource);
  });

  it('keeps processing state ahead of review state and rejects blocked validation', () => {
    const validation = validateStudio2MediaAssetSource('performance_video', 'https://video.example.test/live');
    expect(resolveStudio2MediaAssetState({
      required: true,
      sourceUrl: 'https://video.example.test/live',
      processing: true,
      validation,
      activeReview: review('https://video.example.test/live', 'approved'),
    })).toBe('processing');

    expect(resolveStudio2MediaAssetState({
      required: true,
      sourceUrl: 'not-a-url',
      validation: validateStudio2MediaAssetSource('performance_video', 'not-a-url'),
    })).toBe('invalid');
  });
});
