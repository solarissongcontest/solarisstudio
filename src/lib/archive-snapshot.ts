export type SnapshotCollection = {
  name: string;
  recordCount: number;
  revision?: number | null;
};

export type EditionSnapshotManifest = {
  schemaVersion: 1;
  editionId: string;
  editionNumber: number | null;
  createdAt: string;
  createdBy: string | null;
  sourceRevision: number;
  collections: SnapshotCollection[];
};

export type SnapshotDifference = {
  collection: string;
  previousCount: number;
  nextCount: number;
  delta: number;
};

export function buildEditionSnapshotManifest(input: {
  editionId: string;
  editionNumber?: number | null;
  createdAt?: string;
  createdBy?: string | null;
  sourceRevision: number;
  collections: readonly SnapshotCollection[];
}): EditionSnapshotManifest {
  if (!input.editionId.trim()) throw new Error('Edition id is required for a snapshot');
  if (!Number.isInteger(input.sourceRevision) || input.sourceRevision < 0) {
    throw new Error('Snapshot source revision must be a non-negative integer');
  }

  const names = new Set<string>();
  const collections = input.collections.map((collection) => {
    if (!collection.name.trim()) throw new Error('Snapshot collection name is required');
    if (names.has(collection.name)) throw new Error(`Duplicate snapshot collection: ${collection.name}`);
    if (!Number.isInteger(collection.recordCount) || collection.recordCount < 0) {
      throw new Error(`Invalid record count for snapshot collection: ${collection.name}`);
    }
    names.add(collection.name);
    return { ...collection };
  });

  return {
    schemaVersion: 1,
    editionId: input.editionId,
    editionNumber: input.editionNumber ?? null,
    createdAt: input.createdAt ?? new Date().toISOString(),
    createdBy: input.createdBy ?? null,
    sourceRevision: input.sourceRevision,
    collections: collections.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export function compareSnapshotManifests(
  previous: EditionSnapshotManifest,
  next: EditionSnapshotManifest,
): SnapshotDifference[] {
  if (previous.editionId !== next.editionId) throw new Error('Cannot compare snapshots from different editions');

  const previousCounts = new Map(previous.collections.map((item) => [item.name, item.recordCount]));
  const nextCounts = new Map(next.collections.map((item) => [item.name, item.recordCount]));
  const names = new Set([...previousCounts.keys(), ...nextCounts.keys()]);

  return [...names]
    .map((name) => {
      const previousCount = previousCounts.get(name) ?? 0;
      const nextCount = nextCounts.get(name) ?? 0;
      return {
        collection: name,
        previousCount,
        nextCount,
        delta: nextCount - previousCount,
      };
    })
    .filter((item) => item.delta !== 0)
    .sort((a, b) => a.collection.localeCompare(b.collection));
}
