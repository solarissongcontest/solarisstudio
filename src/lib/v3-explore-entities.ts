import type { CountryIdentityModel } from './country-semantic-model';

export type V3ExploreEntrySummary = {
  entryId: string;
  editionId: string;
  editionLabel: string;
  countryId: string;
  countryName: string;
  artist: string | null;
  song: string | null;
  status: string | null;
};

export type V3CountryExploreProjection = {
  kind: 'country';
  code: string;
  name: string;
  nativeName: string | null;
  region: string | null;
  description: string | null;
  flag: CountryIdentityModel['flag'];
  colors: CountryIdentityModel['colors'];
  currentEntry: Omit<V3ExploreEntrySummary, 'entryId' | 'countryId' | 'countryName'> | null;
  participationHistory: readonly Omit<
    V3ExploreEntrySummary,
    'entryId' | 'countryId' | 'countryName'
  >[];
  actions: CountryIdentityModel['actions'];
  resultsDestination: '/results';
};

export type V3ShowEntryInput = V3ExploreEntrySummary & {
  showId: string;
  runningOrder: number | null;
  public: boolean;
};

export type V3ShowExploreInput = {
  showId: string;
  editionId: string;
  editionLabel: string;
  name: string;
  kind: string;
  status: string;
  public: boolean;
  liveAvailable: boolean;
  resultsPublished: boolean;
  entries: readonly V3ShowEntryInput[];
};

export type V3ShowExploreProjection = {
  kind: 'show';
  showId: string;
  editionId: string;
  editionLabel: string;
  name: string;
  showKind: string;
  status: string;
  runningOrder: readonly V3ShowEntryInput[];
  live: { available: boolean; destination: '/show-mode' | null };
  results: { available: boolean; destination: '/results' };
};

export type V3EntryExploreInput = V3ExploreEntrySummary & {
  showId: string | null;
  showName: string | null;
  artworkUrl?: string | null;
  listeningUrl?: string | null;
  videoUrl?: string | null;
  public: boolean;
};

export type V3EntryExploreProjection = {
  kind: 'entry';
  id: string;
  edition: { id: string; label: string };
  country: { id: string; name: string };
  artist: string | null;
  song: string | null;
  status: string | null;
  show: { id: string; name: string | null } | null;
  media: {
    artworkUrl: string | null;
    listeningUrl: string | null;
    videoUrl: string | null;
  };
  resultsDestination: '/results';
};

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} must be non-empty.`);
  return normalized;
}

function nullable(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function entryFromCountryHistory(
  entry: CountryIdentityModel['history'][number],
): Omit<V3ExploreEntrySummary, 'entryId' | 'countryId' | 'countryName'> {
  return {
    editionId: required(entry.editionId, 'history editionId'),
    editionLabel: required(entry.editionLabel, 'history editionLabel'),
    artist: nullable(entry.artist),
    song: nullable(entry.song),
    status: nullable(entry.status),
  };
}

export function buildV3CountryExploreProjection(
  country: CountryIdentityModel,
): V3CountryExploreProjection {
  const code = required(country.code, 'country code');
  const name = required(country.name, 'country name');

  return {
    kind: 'country',
    code,
    name,
    nativeName: nullable(country.nativeName),
    region: nullable(country.region),
    description: nullable(country.description),
    flag: { ...country.flag },
    colors: { ...country.colors },
    currentEntry: country.currentEntry
      ? {
          editionId: required(country.currentEntry.editionId, 'current entry editionId'),
          editionLabel: required(country.currentEntry.editionLabel, 'current entry editionLabel'),
          artist: nullable(country.currentEntry.artist),
          song: nullable(country.currentEntry.song),
          status: nullable(country.currentEntry.status),
        }
      : null,
    participationHistory: country.history.map(entryFromCountryHistory),
    actions: { ...country.actions },
    resultsDestination: '/results',
  };
}

export function buildV3ShowExploreProjection(input: V3ShowExploreInput): V3ShowExploreProjection {
  if (!input.public) throw new Error('V3 Explore cannot project a private show.');

  const showId = required(input.showId, 'showId');
  const editionId = required(input.editionId, 'editionId');

  const runningOrder = input.entries
    .filter((entry) => entry.public && entry.showId === showId)
    .map((entry) => ({
      ...entry,
      entryId: required(entry.entryId, 'entryId'),
      countryId: required(entry.countryId, 'countryId'),
      countryName: required(entry.countryName, 'countryName'),
      editionId: required(entry.editionId, 'entry editionId'),
      editionLabel: required(entry.editionLabel, 'entry editionLabel'),
      artist: nullable(entry.artist),
      song: nullable(entry.song),
      status: nullable(entry.status),
    }))
    .sort((left, right) => {
      if (left.runningOrder == null && right.runningOrder == null) {
        return left.countryName.localeCompare(right.countryName);
      }
      if (left.runningOrder == null) return 1;
      if (right.runningOrder == null) return -1;
      return left.runningOrder - right.runningOrder;
    });

  return {
    kind: 'show',
    showId,
    editionId,
    editionLabel: required(input.editionLabel, 'editionLabel'),
    name: required(input.name, 'show name'),
    showKind: required(input.kind, 'show kind'),
    status: required(input.status, 'show status'),
    runningOrder,
    live: {
      available: input.liveAvailable,
      destination: input.liveAvailable ? '/show-mode' : null,
    },
    results: {
      available: input.resultsPublished,
      destination: '/results',
    },
  };
}

export function buildV3EntryExploreProjection(
  input: V3EntryExploreInput,
): V3EntryExploreProjection {
  if (!input.public) throw new Error('V3 Explore cannot project a private entry.');

  const id = required(input.entryId, 'entryId');
  const showId = nullable(input.showId);

  return {
    kind: 'entry',
    id,
    edition: {
      id: required(input.editionId, 'editionId'),
      label: required(input.editionLabel, 'editionLabel'),
    },
    country: {
      id: required(input.countryId, 'countryId'),
      name: required(input.countryName, 'countryName'),
    },
    artist: nullable(input.artist),
    song: nullable(input.song),
    status: nullable(input.status),
    show: showId ? { id: showId, name: nullable(input.showName) } : null,
    media: {
      artworkUrl: nullable(input.artworkUrl),
      listeningUrl: nullable(input.listeningUrl),
      videoUrl: nullable(input.videoUrl),
    },
    resultsDestination: '/results',
  };
}

/**
 * Current Solaris entry rows carry artist/song as presentation fields, not as
 * canonical entities with stable IDs. V3 must not manufacture identity by
 * lowercasing, slugifying or string-matching those labels. Until a canonical
 * entity domain exists, artist/song detail belongs to the canonical Entry view.
 */
export const V3_ARTIST_SONG_IDENTITY_POLICY = Object.freeze({
  canonicalArtistEntityAvailable: false,
  canonicalSongEntityAvailable: false,
  standaloneArtistRoutesAllowed: false,
  standaloneSongRoutesAllowed: false,
  detailOwner: 'entry' as const,
});
