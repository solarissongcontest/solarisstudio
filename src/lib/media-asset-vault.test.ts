import { describe, expect, it } from 'vitest';
import {
  canReplaceMediaAsset,
  nextMediaAssetVersion,
  validateMediaAsset,
  type MediaAsset,
} from './media-asset-vault';

const asset: MediaAsset = {
  id: 'asset-1',
  type: 'cover_artwork',
  title: 'Oland entry artwork',
  visibility: 'public',
  owner: { editionId: 'ssc21', entryId: 'entry-1' },
  currentVersionId: null,
  locked: false,
};

describe('media asset vault', () => {
  it('requires contest ownership and allows version history', () => {
    expect(() => validateMediaAsset(asset)).not.toThrow();
    expect(() => validateMediaAsset({ ...asset, owner: {} })).toThrow(/belong to at least one contest entity/i);

    const first = nextMediaAssetVersion({
      assetId: 'asset-1',
      versions: [],
      storagePath: 'ssc21/oland/cover-v1.png',
      mimeType: 'image/png',
      bytes: 1024,
      uploadedBy: 'hod-1',
      uploadedAt: '2026-09-10T18:00:00.000Z',
    });
    const second = nextMediaAssetVersion({
      assetId: 'asset-1',
      versions: [first],
      storagePath: 'ssc21/oland/cover-v2.png',
      mimeType: 'image/png',
      bytes: 2048,
      uploadedBy: 'hod-1',
      uploadedAt: '2026-09-10T19:00:00.000Z',
    });

    expect(first.version).toBe(1);
    expect(second.version).toBe(2);
  });

  it('requires override permission to replace locked canonical assets', () => {
    expect(canReplaceMediaAsset({ ...asset, locked: true })).toBe(false);
    expect(canReplaceMediaAsset({ ...asset, locked: true }, true)).toBe(true);
  });
});
