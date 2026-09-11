import { describe, expect, it } from 'vitest';
import { buildEditionSnapshotManifest, compareSnapshotManifests } from './archive-snapshot';

describe('edition snapshot manifests', () => {
  it('builds a deterministic collection manifest', () => {
    const snapshot = buildEditionSnapshotManifest({
      editionId: 'ssc21',
      editionNumber: 21,
      sourceRevision: 42,
      createdAt: '2026-09-10T18:00:00.000Z',
      collections: [
        { name: 'votes', recordCount: 500 },
        { name: 'entries', recordCount: 26 },
      ],
    });

    expect(snapshot.collections.map((item) => item.name)).toEqual(['entries', 'votes']);
    expect(snapshot.schemaVersion).toBe(1);
  });

  it('reports record-count drift between snapshots', () => {
    const first = buildEditionSnapshotManifest({
      editionId: 'ssc21',
      sourceRevision: 1,
      createdAt: '2026-09-10T18:00:00.000Z',
      collections: [{ name: 'entries', recordCount: 25 }],
    });
    const next = buildEditionSnapshotManifest({
      editionId: 'ssc21',
      sourceRevision: 2,
      createdAt: '2026-09-10T19:00:00.000Z',
      collections: [
        { name: 'entries', recordCount: 26 },
        { name: 'votes', recordCount: 400 },
      ],
    });

    expect(compareSnapshotManifests(first, next)).toEqual([
      { collection: 'entries', previousCount: 25, nextCount: 26, delta: 1 },
      { collection: 'votes', previousCount: 0, nextCount: 400, delta: 400 },
    ]);
  });
});
